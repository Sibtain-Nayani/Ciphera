import { RuleType } from '@/store/documentStore';

export interface Token {
    id: string;
    type: 'text' | RuleType;
    value: string;
}

export const redactionEngine = {
    /**
     * Tokenizes a raw string into an AST (Abstract Syntax Tree) / Array of Span objects.
     * This calls the local Microsoft Presidio Python API to utilize advanced NLP models.
     */
    async tokenize(rawText: string, activeRules: Record<RuleType, boolean>): Promise<Token[]> {
        if (!rawText) return [];

        try {
            const response = await fetch('http://127.0.0.1:8000/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw_text: rawText, active_rules: activeRules })
            });

            if (!response.ok) {
                console.error("Presidio API Error:", response.statusText);
                return [{ id: crypto.randomUUID(), type: 'text', value: rawText }];
            }

            const data = await response.json();
            return data.tokens || [];
        } catch (error) {
            console.error("Failed to connect to Presidio API:", error);
            // Fallback to plain text if the server isn't running
            return [{ id: crypto.randomUUID(), type: 'text', value: rawText }];
        }
    },

    /**
     * Returns a safely redacted display string based on the rule type.
     */
    getRedactionReplacement(type: RuleType, originalValue: string): string {
        switch (type) {
            case 'email': return '[REDACTED_EMAIL]';
            case 'phone': return '[REDACTED_PHONE]';
            case 'creditCard': return '[REDACTED_CC]';
            case 'ssn': return '[REDACTED_SSN]';
            case 'names': return '[REDACTED_NAME]';
            default: return '[REDACTED]';
        }
    }
};
