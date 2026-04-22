/**
 * Ciphera V3 — redactionEngine.ts (with ML scoring)
 * ====================================================
 * Changes:
 *  - tokenize() now accepts useMlScoring flag
 *  - When enabled, detected entities are sent to /api/v3/score-entities
 *    and only entities with should_redact=true are returned as sensitive tokens
 *  - Falls back gracefully if ML scoring endpoint is unavailable
 *  - guessDocumentType() infers doc type from filename for better scoring
 */

import { RuleType, RuleConfig, RedactionAction, CustomRule } from '@/store/documentStore';

export interface Token {
    id:          string;
    type:        'text' | RuleType | string;
    value:       string;
    score?:      number;
    source?:     string;
    entityType?: string;
    // ML scoring extras
    sensitivityScore?: number;
    mlReasoning?:      string;
}

export interface TokenizeResult {
    tokens:     Token[];
    failed:     boolean;
    mlScored?:  boolean;   // whether ML scoring was applied
}

// V3 entity_type → RuleType
const V3_ENTITY_TO_RULE_TYPE: Record<string, RuleType | string> = {
    EMAIL_ADDRESS:  'email',
    PHONE_NUMBER:   'phone',
    CREDIT_CARD:    'creditCard',
    US_SSN:         'ssn',
    PERSON:         'names',
    LOCATION:       'names',
    ORGANIZATION:   'names',
    DATE_TIME:      'date',
    DATE_OF_BIRTH:  'dob',
    URL:            'url',
    IP_ADDRESS:     'ip',
    AADHAAR_NUMBER: 'aadhaar',
    PAN_NUMBER:     'pan',
    GST_NUMBER:     'gst',
    IFSC_CODE:      'ifsc',
    VOTER_ID:       'voterId',
    IN_PASSPORT:    'passport',
    IN_VEHICLE_REG: 'vehicleReg',
};

// Session mapper for consistent pseudonyms
class SessionMapper {
    private counts: Record<string, number> = {};
    private map:    Record<string, string> = {};
    getId(type: string, value: string, label: string): string {
        const key = `${type}::${value.toLowerCase()}`;
        if (this.map[key]) return this.map[key];
        const seq = (this.counts[type] || 0) + 1;
        this.counts[type] = seq;
        this.map[key] = `[${label}_${seq}]`;
        return this.map[key];
    }
    clear() { this.counts = {}; this.map = {}; }
}
export const sessionMapper = new SessionMapper();

// V3 response shapes
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
interface MLScoredEntity {
    entity_type: string; text: string; context: string;
    start: number; end: number;
    pipeline_score: number; sensitivity_score: number;
    final_score: number; reasoning: string; should_redact: boolean;
}
interface MLScoringResponse {
    entities_in: number; entities_out: number;
    entities: MLScoredEntity[];
    document_type: string; model_used: string;
}

// Infer document type from filename for better ML scoring
function guessDocumentType(fileName?: string): string {
    if (!fileName) return 'unknown';
    const name = fileName.toLowerCase();
    if (name.includes('kyc') || name.includes('identity') || name.includes('aadhaar')) return 'kyc';
    if (name.includes('invoice') || name.includes('bill') || name.includes('gst')) return 'invoice';
    if (name.includes('resume') || name.includes('cv') || name.includes('portfolio')) return 'resume';
    if (name.includes('medical') || name.includes('prescription') || name.includes('report')) return 'medical';
    if (name.includes('legal') || name.includes('contract') || name.includes('agreement')) return 'legal';
    if (name.includes('cas') || name.includes('statement') || name.includes('account')) return 'financial';
    return 'unknown';
}

export const redactionEngine = {

    async tokenize(
        rawText:      string,
        activeRules:  Record<RuleType, RuleConfig>,
        customRules:  CustomRule[]  = [],
        threshold:    number        = 0.50,
        cleanOcr:     boolean       = false,
        useMlScoring: boolean       = false,
        fileName?:    string,
    ): Promise<TokenizeResult> {
        if (!rawText) return { tokens: [], failed: false };

        // ── Step 1: V3 detection pipeline ────────────────────────────────────
        let v3Entities: V3Entity[] = [];
        try {
            const response = await fetch('http://127.0.0.1:8000/api/v3/analyze', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text:            rawText,
                    threshold,
                    include_context: true,
                    clean_ocr:       cleanOcr,
                }),
            });
            if (!response.ok) {
                console.error('[Ciphera V3] API error:', response.status);
                return { tokens: [], failed: true };
            }
            const data: V3Response = await response.json();
            v3Entities = data.entities;
        } catch (error) {
            console.error('[Ciphera V3] Backend unreachable:', error);
            return { tokens: [], failed: true };
        }

        // ── Step 2: Optional ML sensitivity scoring ───────────────────────────
        let mlScoreMap: Map<number, MLScoredEntity> | null = null;
        let mlScored = false;

        if (useMlScoring && v3Entities.length > 0) {
            try {
                const scoringPayload = {
                    entities: v3Entities.map(e => ({
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
                };

                const mlResp = await fetch('http://127.0.0.1:8000/api/v3/score-entities', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(scoringPayload),
                });

                if (mlResp.ok) {
                    const mlData: MLScoringResponse = await mlResp.json();
                    mlScoreMap = new Map(
                        mlData.entities.map((e, i) => [i, e])
                    );
                    mlScored = true;
                }
            } catch (err) {
                console.warn('[Ciphera V3] ML scoring unavailable, using pipeline scores:', err);
            }
        }

        // ── Step 3: Build token stream ────────────────────────────────────────
        const activeRuleSet = new Set(
            Object.entries(activeRules)
                .filter(([, cfg]) => cfg.isActive)
                .map(([key]) => key)
        );

        const tokens = this._buildTokenStream(
            rawText, v3Entities, activeRuleSet, customRules, mlScoreMap
        );

        return { tokens, failed: false, mlScored };
    },

    _buildTokenStream(
        rawText:     string,
        entities:    V3Entity[],
        activeRules: Set<string>,
        customRules: CustomRule[],
        mlScoreMap:  Map<number, MLScoredEntity> | null,
    ): Token[] {
        const tokens: Token[]   = [];
        let   cursor            = 0;
        let   tokenIdx          = 0;

        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];

            // Plain text before entity
            if (cursor < entity.start) {
                tokens.push({ id: `t-${tokenIdx++}`, type: 'text', value: rawText.slice(cursor, entity.start) });
            }

            const ruleType = V3_ENTITY_TO_RULE_TYPE[entity.entity_type] ?? entity.entity_type;
            const isActive = activeRules.has(ruleType as RuleType);

            // If ML scored, only show as sensitive if should_redact=true
            const mlEntry    = mlScoreMap?.get(i) ?? null;
            const passesML   = mlScoreMap ? (mlEntry?.should_redact ?? false) : true;
            const shouldMark = isActive && passesML;

            if (shouldMark) {
                tokens.push({
                    id:               `e-${tokenIdx++}`,
                    type:             ruleType,
                    value:            entity.text,
                    score:            mlEntry?.final_score ?? entity.score,
                    source:           entity.source,
                    entityType:       entity.entity_type,
                    sensitivityScore: mlEntry?.sensitivity_score,
                    mlReasoning:      mlEntry?.reasoning,
                });
            } else {
                tokens.push({ id: `t-${tokenIdx++}`, type: 'text', value: entity.text });
            }

            cursor = entity.end;
        }

        if (cursor < rawText.length) {
            tokens.push({ id: `t-${tokenIdx++}`, type: 'text', value: rawText.slice(cursor) });
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
        // replace — use consistent pseudonyms
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
            case 'aadhaar':    return sessionMapper.getId(type, originalValue, 'AADHAAR');
            case 'pan':        return sessionMapper.getId(type, originalValue, 'PAN');
            case 'gst':        return sessionMapper.getId(type, originalValue, 'GST');
            case 'ifsc':       return sessionMapper.getId(type, originalValue, 'IFSC');
            case 'voterId':    return sessionMapper.getId(type, originalValue, 'VOTER_ID');
            case 'passport':   return sessionMapper.getId(type, originalValue, 'PASSPORT');
            case 'vehicleReg': return sessionMapper.getId(type, originalValue, 'VEHICLE');
            default: {
                const cr = customRules.find(r => `custom_${r.id}` === type || r.id === type);
                if (cr) return sessionMapper.getId(type, originalValue, cr.label.toUpperCase().replace(/\s+/g, '_'));
                return sessionMapper.getId('unknown', originalValue, 'REDACTED');
            }
        }
    },
};