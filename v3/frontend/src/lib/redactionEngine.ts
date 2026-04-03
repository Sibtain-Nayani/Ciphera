import { RuleType, RuleConfig, RedactionAction, CustomRule } from '@/store/documentStore';

export interface Token {
    id: string;
    type: 'text' | RuleType | string;
    value: string;
    // V3 extras — available for richer UI display if needed
    score?: number;
    source?: string;
    entityType?: string;
}

export interface TokenizeResult {
    tokens: Token[];
    failed: boolean;
}

/**
 * Maps V3 entity_type strings → V2 RuleType so the existing UI
 * (canvas overlays, toolbar, redaction actions) needs zero changes.
 *
 * Any V3 entity type not listed here falls through to 'unknown',
 * which the replacement logic handles via SessionMapper.
 */
const V3_ENTITY_TO_RULE_TYPE: Record<string, RuleType | string> = {
    // Standard
    EMAIL_ADDRESS:  'email',
    PHONE_NUMBER:   'phone',
    CREDIT_CARD:    'creditCard',
    US_SSN:         'ssn',
    PERSON:         'names',
    // Indian PII — map to closest V2 type or keep as-is for custom rendering
    AADHAAR_NUMBER: 'aadhaar',
    PAN_NUMBER:     'pan',
    GST_NUMBER:     'gst',
    IFSC_CODE:      'ifsc',
    VOTER_ID:       'voterId',
    IN_PASSPORT:    'passport',
    IN_VEHICLE_REG: 'vehicleReg',
    // Generic
    LOCATION:       'names',   // treat locations like names for redaction action
    ORGANIZATION:   'names',
    DATE_TIME:      'date',
    URL:            'url',
    IP_ADDRESS:     'ip',
};

/**
 * V3 entity types that are enabled by default when active rules are checked.
 * We derive this from the active_rules map passed in from the store.
 */
const RULE_TYPE_TO_V3_ENTITIES: Record<string, string[]> = {
    email:      ['EMAIL_ADDRESS'],
    phone:      ['PHONE_NUMBER'],
    creditCard: ['CREDIT_CARD'],
    ssn:        ['US_SSN'],
    names:      ['PERSON', 'LOCATION', 'ORGANIZATION'],
    // Indian PII — always passed; backend filters by score
    aadhaar:    ['AADHAAR_NUMBER'],
    pan:        ['PAN_NUMBER'],
};

// ─── Session Mapper (unchanged from V2) ────────────────────────────────────

class SessionMapper {
    private counts: Record<string, number> = {};
    private map: Record<string, string> = {};

    getId(type: string, originalValue: string, label: string): string {
        const key = `${type}::${originalValue.toLowerCase()}`;
        if (this.map[key]) return this.map[key];
        const seq = (this.counts[type] || 0) + 1;
        this.counts[type] = seq;
        const tag = `[${label}_${seq}]`;
        this.map[key] = tag;
        return tag;
    }

    clear() {
        this.counts = {};
        this.map = {};
    }
}

export const sessionMapper = new SessionMapper();

// ─── V3 response shape ──────────────────────────────────────────────────────

interface V3Entity {
    start:       number;
    end:         number;
    entity_type: string;
    text:        string;
    score:       number;
    source:      string;
    context:     string;
    merged_from: string[];
}

interface V3Response {
    entity_count: number;
    entities:     V3Entity[];
    stats:        Record<string, unknown>;
}

// ─── Core engine ────────────────────────────────────────────────────────────

export const redactionEngine = {
    /**
     * Calls the V3 multi-layer detection pipeline and converts the
     * entity span list into the same Token[] AST format that V2 uses.
     *
     * Fail-secure: if backend is unreachable, returns failed=true
     * and empty tokens — the caller must block export.
     */
    async tokenize(
        rawText: string,
        activeRules: Record<RuleType, RuleConfig>,
        customRules: CustomRule[] = [],
        threshold: number = 0.50,
    ): Promise<TokenizeResult> {
        if (!rawText) return { tokens: [], failed: false };

        // Determine which active rules the user has switched on
        const enabledRuleTypes = Object.entries(activeRules)
            .filter(([, config]) => config.isActive)
            .map(([key]) => key);

        // Build the set of V3 entity types we care about
        // (union of all enabled rule → entity mappings)
        // We pass threshold rather than an entity filter — the backend
        // returns everything above threshold and we filter client-side.
        // This keeps the backend generic and the UI in control.

        try {
            const response = await fetch('http://127.0.0.1:8000/api/v3/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text:            rawText,
                    threshold:       threshold,
                    include_context: false,
                }),
            });

            if (!response.ok) {
                console.error('[Ciphera V3] API error:', response.status, response.statusText);
                return { tokens: [], failed: true };
            }

            const data: V3Response = await response.json();

            // Build a set of character positions that are inside a detected entity
            // so we can reconstruct the full token stream (entity + plain text spans)
            const tokens = this._buildTokenStream(rawText, data.entities, activeRules, customRules);
            return { tokens, failed: false };

        } catch (error) {
            console.error('[Ciphera V3] Failed to reach backend:', error);
            return { tokens: [], failed: true };
        }
    },

    /**
     * Converts V3 entity spans + plain text gaps into the Token[] AST.
     *
     * Token types:
     *   'text'        → plain, non-sensitive span
     *   RuleType      → built-in sensitive span (email, phone, etc.)
     *   string (other) → Indian PII or other V3-only types
     */
    _buildTokenStream(
        rawText:     string,
        entities:    V3Entity[],
        activeRules: Record<RuleType, RuleConfig>,
        customRules: CustomRule[],
    ): Token[] {
        const tokens: Token[] = [];
        let cursor = 0;
        let tokenIndex = 0;

        // Determine which rule types are active for client-side filtering
        const activeRuleSet = new Set(
            Object.entries(activeRules)
                .filter(([, cfg]) => cfg.isActive)
                .map(([key]) => key)
        );

        for (const entity of entities) {
            // 1. Plain text before this entity
            if (cursor < entity.start) {
                tokens.push({
                    id:    `t-${tokenIndex++}`,
                    type:  'text',
                    value: rawText.slice(cursor, entity.start),
                });
            }

            // 2. Map V3 entity type → V2 rule type
            const ruleType = V3_ENTITY_TO_RULE_TYPE[entity.entity_type] ?? entity.entity_type;

            // 3. Client-side filter: only redact if the mapped rule is active
            //    Indian PII types (aadhaar, pan, etc.) are always shown
            //    since they have no V2 toggle yet — Step 4 adds those toggles
            const isBuiltIn  = ruleType in activeRules;
            const isIndianPII = !isBuiltIn;  // always show Indian PII entities
            const isActive   = isIndianPII || activeRuleSet.has(ruleType as RuleType);

            if (isActive) {
                tokens.push({
                    id:         `e-${tokenIndex++}`,
                    type:       ruleType,
                    value:      entity.text,
                    score:      entity.score,
                    source:     entity.source,
                    entityType: entity.entity_type,
                });
            } else {
                // Rule is off — treat as plain text
                tokens.push({
                    id:    `t-${tokenIndex++}`,
                    type:  'text',
                    value: entity.text,
                });
            }

            cursor = entity.end;
        }

        // 4. Remaining plain text after last entity
        if (cursor < rawText.length) {
            tokens.push({
                id:    `t-${tokenIndex++}`,
                type:  'text',
                value: rawText.slice(cursor),
            });
        }

        return tokens;
    },

    /**
     * Returns a safely redacted display string.
     * Unchanged from V2 — supports mask, blackout, replace.
     * Extended to handle Indian PII label tags.
     */
    getRedactionReplacement(
        type: RuleType | string,
        originalValue: string,
        action: RedactionAction,
        customRules: CustomRule[] = [],
    ): string {
        if (action === 'blackout') return '████████';

        if (action === 'mask') {
            if (originalValue.length <= 4) return '****';
            return `${originalValue.slice(0, 2)}****${originalValue.slice(-2)}`;
        }

        // action === 'replace' — use SessionMapper for consistent pseudonyms
        switch (type) {
            case 'email':      return sessionMapper.getId(type, originalValue, 'EMAIL');
            case 'phone':      return sessionMapper.getId(type, originalValue, 'PHONE');
            case 'creditCard': return sessionMapper.getId(type, originalValue, 'CC');
            case 'ssn':        return sessionMapper.getId(type, originalValue, 'SSN');
            case 'names':      return sessionMapper.getId(type, originalValue, 'PERSON');
            // Indian PII
            case 'aadhaar':    return sessionMapper.getId(type, originalValue, 'AADHAAR');
            case 'pan':        return sessionMapper.getId(type, originalValue, 'PAN');
            case 'gst':        return sessionMapper.getId(type, originalValue, 'GST');
            case 'ifsc':       return sessionMapper.getId(type, originalValue, 'IFSC');
            case 'voterId':    return sessionMapper.getId(type, originalValue, 'VOTER_ID');
            case 'passport':   return sessionMapper.getId(type, originalValue, 'PASSPORT');
            case 'vehicleReg': return sessionMapper.getId(type, originalValue, 'VEHICLE');
            case 'date':       return sessionMapper.getId(type, originalValue, 'DATE');
            case 'url':        return sessionMapper.getId(type, originalValue, 'URL');
            case 'ip':         return sessionMapper.getId(type, originalValue, 'IP');
            default: {
                const customRule = customRules.find(
                    (r) => `custom_${r.id}` === type || r.id === type
                );
                if (customRule) {
                    const safeLabel = customRule.label.toUpperCase().replace(/\s+/g, '_');
                    return sessionMapper.getId(type, originalValue, safeLabel);
                }
                return sessionMapper.getId('unknown', originalValue, 'REDACTED');
            }
        }
    },
};