/**
 * Ciphera V3.1 — redactionEngine.ts
 * ====================================
 * Changes over v3.0:
 *  - Full Hindi + mixed language support in tokenize()
 *  - Normalises response from all three endpoints:
 *      /api/v3/analyze          → { entities: V3Entity[] }
 *      /api/v3/analyze-hindi    → { entities: HindiEntity[] }  (adds language: "hi")
 *      /api/v3/analyze-mixed    → { entities: MixedEntity[] }  (has language field)
 *  - Hindi entity positions merged into same token stream as English
 *  - New entity types from v3.1: UPI_ID, BANK_ACCOUNT, DRIVING_LICENCE, PIN_CODE
 *  - Devanagari text preserved correctly in token values
 *  - languageMode now flows all the way from page → tokenize → endpoint selection
 */

import { RuleType, RuleConfig, RedactionAction, CustomRule } from '@/store/documentStore';

// ── Token interface ────────────────────────────────────────────────────────────
export interface Token {
    id:               string;
    type:             'text' | RuleType | string;
    value:            string;
    score?:           number;
    source?:          string;
    entityType?:      string;
    language?:        'en' | 'hi';     // NEW: which pipeline detected this
    sensitivityScore?: number;
    mlReasoning?:     string;
}

export interface TokenizeResult {
    tokens:     Token[];
    failed:     boolean;
    mlScored?:  boolean;
    language?:  'english' | 'hindi' | 'mixed';
}

// ── Entity type mapping ────────────────────────────────────────────────────────
// Maps backend entity_type strings → frontend RuleType keys
const V3_ENTITY_TO_RULE: Record<string, RuleType | string> = {
    // English pipeline
    EMAIL_ADDRESS:    'email',
    PHONE_NUMBER:     'phone',
    CREDIT_CARD:      'creditCard',
    US_SSN:           'ssn',
    PERSON:           'names',
    LOCATION:         'names',
    ORGANIZATION:     'names',
    DATE_TIME:        'date',
    DATE_OF_BIRTH:    'dob',
    URL:              'url',
    IP_ADDRESS:       'ip',
    AADHAAR_NUMBER:   'aadhaar',
    PAN_NUMBER:       'pan',
    GST_NUMBER:       'gst',
    IFSC_CODE:        'ifsc',
    VOTER_ID:         'voterId',
    IN_PASSPORT:      'passport',
    IN_VEHICLE_REG:   'vehicleReg',
    // V3.1 new types
    UPI_ID:           'upi',
    BANK_ACCOUNT:     'bankAccount',
    DRIVING_LICENCE:  'drivingLicence',
    PIN_CODE:         'pinCode',
    // Hindi pipeline returns same entity_type strings — same map works
    NRP:              'names',
};

// ── Normalised entity shape (common across all 3 endpoints) ───────────────────
interface NormalisedEntity {
    start:       number;
    end:         number;
    entity_type: string;
    text:        string;
    score:       number;
    source:      string;
    context:     string;
    language:    'en' | 'hi';
}

// ── Raw response shapes from each endpoint ────────────────────────────────────
interface V3Entity {
    start: number; end: number; entity_type: string;
    text: string; score: number; source: string;
    context: string; merged_from: string[];
}
interface V3Response {
    entity_count: number;
    entities:     V3Entity[];
    stats:        Record<string, unknown>;
}

// analyze-hindi returns same shape but entities have language: "hi"
interface HindiEntity extends V3Entity {
    language?: string;
}
interface HindiResponse {
    entity_count:  number;
    entities:      HindiEntity[];
    language_info: Record<string, unknown>;
    stats:         Record<string, unknown>;
}

// analyze-mixed returns entities with language field
interface MixedEntity extends V3Entity {
    language?: string;
}
interface MixedResponse {
    entity_count:  number;
    entities:      MixedEntity[];
    language_info: Record<string, unknown>;
    stats:         Record<string, unknown>;
}

// ── ML scoring types ──────────────────────────────────────────────────────────
interface MLScoredEntity {
    entity_type: string; text: string; context: string;
    start: number; end: number;
    pipeline_score: number; sensitivity_score: number;
    final_score: number; reasoning: string; should_redact: boolean;
}
interface MLScoringResponse {
    entities: MLScoredEntity[];
    document_type: string; model_used: string;
}

// ── Session pseudonym mapper ──────────────────────────────────────────────────
class SessionMapper {
    private counts: Record<string, number> = {};
    private map:    Record<string, string>  = {};
    getId(type: string, value: string, label: string): string {
        const key = `${type}::${value.toLowerCase()}`;
        if (this.map[key]) return this.map[key];
        const seq      = (this.counts[type] || 0) + 1;
        this.counts[type] = seq;
        this.map[key]  = `[${label}_${seq}]`;
        return this.map[key];
    }
    clear() { this.counts = {}; this.map = {}; }
}
export const sessionMapper = new SessionMapper();

// ── Helpers ───────────────────────────────────────────────────────────────────
function guessDocumentType(fileName?: string): string {
    if (!fileName) return 'unknown';
    const n = fileName.toLowerCase();
    if (n.includes('kyc') || n.includes('identity') || n.includes('aadhaar')) return 'kyc';
    if (n.includes('invoice') || n.includes('bill') || n.includes('gst'))     return 'invoice';
    if (n.includes('resume') || n.includes('cv'))                              return 'resume';
    if (n.includes('medical') || n.includes('prescription'))                   return 'medical';
    if (n.includes('legal') || n.includes('contract'))                         return 'legal';
    if (n.includes('statement') || n.includes('account'))                      return 'financial';
    return 'unknown';
}

/**
 * Normalise response from any of the three endpoints into a common list.
 * Mixed response already has language="en"/"hi" per entity.
 * Hindi response entities get language="hi".
 * English response entities get language="en".
 */
function normaliseEntities(
    data:     V3Response | HindiResponse | MixedResponse,
    mode:     'english' | 'hindi' | 'mixed',
): NormalisedEntity[] {
    return (data.entities as MixedEntity[]).map(e => ({
        start:       e.start,
        end:         e.end,
        entity_type: e.entity_type,
        text:        e.text,
        score:       e.score,
        source:      e.source,
        context:     e.context ?? '',
        language:    (e.language === 'hi' ? 'hi' : (mode === 'hindi' ? 'hi' : 'en')) as 'en' | 'hi',
    }));
}

// ── Main engine ───────────────────────────────────────────────────────────────
export const redactionEngine = {

    async tokenize(
        rawText:      string,
        activeRules:  Record<RuleType, RuleConfig>,
        customRules:  CustomRule[]                         = [],
        threshold:    number                               = 0.50,
        cleanOcr:     boolean                              = false,
        useMlScoring: boolean                              = false,
        fileName?:    string,
        languageMode: 'english' | 'hindi' | 'mixed' = 'english',
    ): Promise<TokenizeResult> {
        if (!rawText.trim()) return { tokens: [], failed: false };

        // ── Step 1: Call the right endpoint ──────────────────────────────────
        let normEntities: NormalisedEntity[] = [];

        try {
            const endpoint =
                languageMode === 'hindi' ? 'http://127.0.0.1:8000/api/v3/analyze-hindi'
              : languageMode === 'mixed' ? 'http://127.0.0.1:8000/api/v3/analyze-mixed'
              :                           'http://127.0.0.1:8000/api/v3/analyze';

            // Payload differs slightly per endpoint
            let body: Record<string, unknown>;
            if (languageMode === 'mixed') {
                body = {
                    text:               rawText,
                    threshold_english:  threshold,
                    threshold_hindi:    Math.max(0.40, threshold - 0.05), // slightly lower for Hindi
                };
            } else if (languageMode === 'hindi') {
                body = {
                    text:          rawText,
                    threshold,
                    language_hint: 'auto',
                };
            } else {
                body = {
                    text:            rawText,
                    threshold,
                    include_context: true,
                    clean_ocr:       cleanOcr,
                };
            }

            const resp = await fetch(endpoint, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });

            if (!resp.ok) {
                console.error('[Ciphera] API error:', resp.status);
                return { tokens: [], failed: true };
            }

            const data = await resp.json();
            normEntities = normaliseEntities(data, languageMode);

        } catch (err) {
            console.error('[Ciphera] Backend unreachable:', err);
            return { tokens: [], failed: true };
        }

        // ── Step 2: Optional ML sensitivity scoring ───────────────────────────
        let mlScoreMap: Map<number, MLScoredEntity> | null = null;
        let mlScored = false;

        if (useMlScoring && normEntities.length > 0) {
            try {
                const mlResp = await fetch('http://127.0.0.1:8000/api/v3/score-entities', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entities: normEntities.map(e => ({
                            entity_type: e.entity_type,
                            text:        e.text,
                            context:     e.context,
                            start:       e.start,
                            end:         e.end,
                            score:       e.score,
                            source:      e.source,
                        })),
                        document_text: rawText.slice(0, 10000),
                        document_type: guessDocumentType(fileName),
                        threshold:     0.45,
                    }),
                });
                if (mlResp.ok) {
                    const mlData: MLScoringResponse = await mlResp.json();
                    mlScoreMap = new Map(mlData.entities.map((e, i) => [i, e]));
                    mlScored   = true;
                }
            } catch {
                // ML scoring offline — continue with pipeline scores
            }
        }

        // ── Step 3: Build token stream ────────────────────────────────────────
        const activeRuleSet = new Set(
            Object.entries(activeRules)
                .filter(([, cfg]) => cfg.isActive)
                .map(([key]) => key)
        );

        const tokens = this._buildTokenStream(
            rawText, normEntities, activeRuleSet, customRules, mlScoreMap
        );

        return { tokens, failed: false, mlScored, language: languageMode };
    },

    _buildTokenStream(
        rawText:     string,
        entities:    NormalisedEntity[],
        activeRules: Set<string>,
        customRules: CustomRule[],
        mlScoreMap:  Map<number, MLScoredEntity> | null,
    ): Token[] {
        const tokens: Token[] = [];
        let   cursor          = 0;
        let   idx             = 0;

        // Sort by start position — mixed endpoint already sorted but be safe
        const sorted = [...entities].sort((a, b) => a.start - b.start);

        for (let i = 0; i < sorted.length; i++) {
            const entity = sorted[i];

            // Guard: skip out-of-bounds or overlapping entities
            if (entity.start < cursor || entity.end > rawText.length) continue;
            if (entity.start >= entity.end) continue;

            // Plain text segment before this entity
            if (cursor < entity.start) {
                tokens.push({
                    id:    `t-${idx++}`,
                    type:  'text',
                    value: rawText.slice(cursor, entity.start),
                });
            }

            const ruleType   = V3_ENTITY_TO_RULE[entity.entity_type] ?? entity.entity_type;
            // Check against both built-in rules and custom rules
            const builtinActive = activeRules.has(ruleType as RuleType);
            const customMatch   = customRules.find(r => r.isActive && (
                `custom_${r.id}` === ruleType || r.id === ruleType
            ));
            const isActive = builtinActive || Boolean(customMatch);

            // ML gate
            const mlEntry  = mlScoreMap?.get(i) ?? null;
            const passesML = mlScoreMap ? (mlEntry?.should_redact ?? false) : true;

            if (isActive && passesML) {
                tokens.push({
                    id:               `e-${idx++}`,
                    type:             ruleType,
                    value:            entity.text,
                    score:            mlEntry?.final_score ?? entity.score,
                    source:           entity.source,
                    entityType:       entity.entity_type,
                    language:         entity.language,
                    sensitivityScore: mlEntry?.sensitivity_score,
                    mlReasoning:      mlEntry?.reasoning,
                });
            } else {
                tokens.push({
                    id:    `t-${idx++}`,
                    type:  'text',
                    value: entity.text,
                });
            }

            cursor = entity.end;
        }

        // Remaining text after last entity
        if (cursor < rawText.length) {
            tokens.push({
                id:    `t-${idx++}`,
                type:  'text',
                value: rawText.slice(cursor),
            });
        }

        return tokens;
    },

    getRedactionReplacement(
        type:          RuleType | string,
        originalValue: string,
        action:        RedactionAction,
        customRules:   CustomRule[] = [],
    ): string {
        if (action === 'blackout') return '████████';
        if (action === 'mask') {
            if (originalValue.length <= 4) return '****';
            return `${originalValue.slice(0, 2)}****${originalValue.slice(-2)}`;
        }
        // replace — consistent pseudonyms via session mapper
        const LABELS: Record<string, string> = {
            email:          'EMAIL',
            phone:          'PHONE',
            creditCard:     'CC',
            ssn:            'SSN',
            names:          'PERSON',
            dob:            'DOB',
            date:           'DATE',
            url:            'URL',
            ip:             'IP',
            aadhaar:        'AADHAAR',
            pan:            'PAN',
            gst:            'GST',
            ifsc:           'IFSC',
            voterId:        'VOTER_ID',
            passport:       'PASSPORT',
            vehicleReg:     'VEHICLE',
            upi:            'UPI',
            bankAccount:    'BANK_ACCT',
            drivingLicence: 'DL',
            pinCode:        'PIN',
        };
        const label = LABELS[type];
        if (label) return sessionMapper.getId(type, originalValue, label);

        // Custom rule
        const cr = customRules.find(r => `custom_${r.id}` === type || r.id === type);
        if (cr) return sessionMapper.getId(
            type, originalValue, cr.label.toUpperCase().replace(/\s+/g, '_')
        );

        return sessionMapper.getId('unknown', originalValue, 'REDACTED');
    },
};