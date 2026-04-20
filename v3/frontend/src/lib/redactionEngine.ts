/**
 * Ciphera V3 — Feature 4: Frontend Indian PII Integration
 * =========================================================
 * This file is the COMPLETE updated redactionEngine.ts.
 * 
 * Changes over previous version:
 *  - Indian PII rule types now respect toggle state from documentStore
 *    (previously they were always shown regardless of toggle)
 *  - DATE_OF_BIRTH is now a first-class rule type with its own toggle
 *  - clean_ocr flag forwarded to backend when fileType === 'image'
 *  - confidence threshold now pulled from a store value (tunable per-session)
 * 
 * Replace: v3/frontend/src/lib/redactionEngine.ts
 */

import { RuleType, RuleConfig, RedactionAction, CustomRule } from '@/store/documentStore';

export interface Token {
    id:          string;
    type:        'text' | RuleType | string;
    value:       string;
    score?:      number;
    source?:     string;
    entityType?: string;
}

export interface TokenizeResult {
    tokens: Token[];
    failed: boolean;
}

/**
 * V3 entity_type → RuleType mapping.
 * ALL types now respect the toggle — Indian PII included.
 */
const V3_ENTITY_TO_RULE_TYPE: Record<string, RuleType | string> = {
    EMAIL_ADDRESS:  'email',
    PHONE_NUMBER:   'phone',
    CREDIT_CARD:    'creditCard',
    US_SSN:         'ssn',
    PERSON:         'names',
    LOCATION:       'names',
    ORGANIZATION:   'names',
    DATE_TIME:      'date',
    DATE_OF_BIRTH:  'dob',      // new — has its own toggle now
    URL:            'url',
    IP_ADDRESS:     'ip',
    // Indian PII — now fully toggle-controlled
    AADHAAR_NUMBER: 'aadhaar',
    PAN_NUMBER:     'pan',
    GST_NUMBER:     'gst',
    IFSC_CODE:      'ifsc',
    VOTER_ID:       'voterId',
    IN_PASSPORT:    'passport',
    IN_VEHICLE_REG: 'vehicleReg',
};

// ── Session Mapper ──────────────────────────────────────────────────────────

class SessionMapper {
    private counts: Record<string, number> = {};
    private map:    Record<string, string> = {};

    getId(type: string, originalValue: string, label: string): string {
        const key = `${type}::${originalValue.toLowerCase()}`;
        if (this.map[key]) return this.map[key];
        const seq = (this.counts[type] || 0) + 1;
        this.counts[type] = seq;
        const tag = `[${label}_${seq}]`;
        this.map[key] = tag;
        return tag;
    }

    clear() { this.counts = {}; this.map = {}; }
}

export const sessionMapper = new SessionMapper();

// ── V3 response shape ───────────────────────────────────────────────────────

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

// ── Core engine ─────────────────────────────────────────────────────────────

export const redactionEngine = {

    async tokenize(
        rawText:      string,
        activeRules:  Record<RuleType, RuleConfig>,
        customRules:  CustomRule[] = [],
        threshold:    number       = 0.50,
        cleanOcr:     boolean      = false,
    ): Promise<TokenizeResult> {
        if (!rawText) return { tokens: [], failed: false };

        try {
            const response = await fetch('http://127.0.0.1:8000/api/v3/analyze', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text:            rawText,
                    threshold:       threshold,
                    include_context: false,
                    clean_ocr:       cleanOcr,
                }),
            });

            if (!response.ok) {
                console.error('[Ciphera V3] API error:', response.status);
                return { tokens: [], failed: true };
            }

            const data: V3Response = await response.json();
            const tokens = this._buildTokenStream(rawText, data.entities, activeRules, customRules);
            return { tokens, failed: false };

        } catch (error) {
            console.error('[Ciphera V3] Failed to reach backend:', error);
            return { tokens: [], failed: true };
        }
    },

    _buildTokenStream(
        rawText:     string,
        entities:    V3Entity[],
        activeRules: Record<RuleType, RuleConfig>,
        customRules: CustomRule[],
    ): Token[] {
        const tokens:        Token[]  = [];
        let   cursor                  = 0;
        let   tokenIndex              = 0;

        // Build active rule set — includes ALL rule types that are toggled on
        const activeRuleSet = new Set(
            Object.entries(activeRules)
                .filter(([, cfg]) => cfg.isActive)
                .map(([key]) => key)
        );

        for (const entity of entities) {
            // Plain text before entity
            if (cursor < entity.start) {
                tokens.push({
                    id:    `t-${tokenIndex++}`,
                    type:  'text',
                    value: rawText.slice(cursor, entity.start),
                });
            }

            const ruleType = V3_ENTITY_TO_RULE_TYPE[entity.entity_type] ?? entity.entity_type;

            // ALL entities now respect toggle state
            const isActive = activeRuleSet.has(ruleType as RuleType);

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
                tokens.push({
                    id:    `t-${tokenIndex++}`,
                    type:  'text',
                    value: entity.text,
                });
            }

            cursor = entity.end;
        }

        // Remaining plain text
        if (cursor < rawText.length) {
            tokens.push({
                id:    `t-${tokenIndex++}`,
                type:  'text',
                value: rawText.slice(cursor),
            });
        }

        return tokens;
    },

    getRedactionReplacement(
        type:         RuleType | string,
        originalValue: string,
        action:       RedactionAction,
        customRules:  CustomRule[] = [],
    ): string {
        if (action === 'blackout') return '████████';

        if (action === 'mask') {
            if (originalValue.length <= 4) return '****';
            return `${originalValue.slice(0, 2)}****${originalValue.slice(-2)}`;
        }

        switch (type) {
            case 'email':      return sessionMapper.getId(type, originalValue, 'EMAIL');
            case 'phone':      return sessionMapper.getId(type, originalValue, 'PHONE');
            case 'creditCard': return sessionMapper.getId(type, originalValue, 'CC');
            case 'ssn':        return sessionMapper.getId(type, originalValue, 'SSN');
            case 'names':      return sessionMapper.getId(type, originalValue, 'PERSON');
            case 'dob':        return sessionMapper.getId(type, originalValue, 'DOB');
            case 'date':       return sessionMapper.getId(type, originalValue, 'DATE');
            case 'url':        return sessionMapper.getId(type, originalValue, 'URL');
            case 'ip':         return sessionMapper.getId(type, originalValue, 'IP');
            // Indian PII
            case 'aadhaar':    return sessionMapper.getId(type, originalValue, 'AADHAAR');
            case 'pan':        return sessionMapper.getId(type, originalValue, 'PAN');
            case 'gst':        return sessionMapper.getId(type, originalValue, 'GST');
            case 'ifsc':       return sessionMapper.getId(type, originalValue, 'IFSC');
            case 'voterId':    return sessionMapper.getId(type, originalValue, 'VOTER_ID');
            case 'passport':   return sessionMapper.getId(type, originalValue, 'PASSPORT');
            case 'vehicleReg': return sessionMapper.getId(type, originalValue, 'VEHICLE');
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
