import { RuleType, RuleConfig, RedactionAction, CustomRule } from '@/store/documentStore';

export interface Token {
    id: string;
    type: 'text' | RuleType | string;   // string covers custom rule IDs
    value: string;
}

/** Result of a tokenize() call. `failed` is true when the backend was unreachable. */
export interface TokenizeResult {
    tokens: Token[];
    failed: boolean;
}

/**
 * SessionMapper tracks unique sensitive entities and assigns them deterministic indices
 * (e.g. John -> PERSON_1). This preserves downstream data correlation.
 */
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

export const redactionEngine = {
    /**
     * Tokenizes a raw string into an AST (Abstract Syntax Tree) / Array of Span objects.
     * Calls the local Microsoft Presidio Python API for built-in rules,
     * and passes custom regex rules for dynamic pattern recognition.
     *
     * Returns a fail-secure result: if the backend is unreachable or returns
     * an error, `failed` is set to true and `tokens` is empty — the caller
     * must block export to prevent unredacted data from leaking.
     */
    async tokenize(
        rawText: string,
        activeRules: Record<RuleType, RuleConfig>,
        customRules: CustomRule[] = []
    ): Promise<TokenizeResult> {
        if (!rawText) return { tokens: [], failed: false };

        // Map built-in rules to simple boolean flags
        const apiRules = Object.fromEntries(
            Object.entries(activeRules).map(([key, config]) => [key, config.isActive])
        );

        // Filter to active custom rules with valid patterns
        const activeCustomRules = customRules
            .filter((r) => {
                if (!r.isActive || !r.pattern.trim()) return false;
                try {
                    new RegExp(r.pattern);
                    return true;
                } catch {
                    return false;
                }
            })
            .map((r) => ({
                id: r.id,
                label: r.label,
                pattern: r.pattern,
            }));

        try {
            const response = await fetch('http://127.0.0.1:8000/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    raw_text: rawText,
                    active_rules: apiRules,
                    custom_rules: activeCustomRules,
                }),
            });

            if (!response.ok) {
                console.error("Presidio API Error:", response.status, response.statusText);
                // ── FAIL-SECURE: Do NOT return raw text as a fallback ──
                return { tokens: [], failed: true };
            }

            const data = await response.json();
            return { tokens: data.tokens || [], failed: false };
        } catch (error) {
            console.error("Failed to connect to Presidio API:", error);
            // ── FAIL-SECURE: Block export, don't leak unredacted text ──
            return { tokens: [], failed: true };
        }
    },

    /**
     * Returns a safely redacted display string based on the rule type.
     * Supports both built-in types and custom rule IDs.
     */
    getRedactionReplacement(
        type: RuleType | string,
        originalValue: string,
        action: RedactionAction,
        customRules: CustomRule[] = []
    ): string {
        if (action === 'blackout') {
            return '████████';
        }

        if (action === 'mask') {
            if (originalValue.length <= 4) return '****';
            const firstChars = originalValue.slice(0, 2);
            const lastChars = originalValue.slice(-2);
            return `${firstChars}****${lastChars}`;
        }

        // action === 'replace'
        switch (type) {
            case 'email': return sessionMapper.getId(type, originalValue, 'EMAIL');
            case 'phone': return sessionMapper.getId(type, originalValue, 'PHONE');
            case 'creditCard': return sessionMapper.getId(type, originalValue, 'CC');
            case 'ssn': return sessionMapper.getId(type, originalValue, 'SSN');
            case 'names': return sessionMapper.getId(type, originalValue, 'PERSON');
            default: {
                // Check if it's a custom rule type (prefixed with "custom_")
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
