import { RuleType } from '@/store/documentStore';

export interface Token {
    id: string;
    type: 'text' | RuleType;
    value: string;
}

// Dictionary of Regex patterns for our rules
const PATTERNS: Record<Exclude<RuleType, 'names'>, RegExp> = {
    email: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/i,
    phone: /(\d{3}[-\s.]?\d{4}[-\s.]?\d{3,4}|\(\d{3}\)\s*\d{3}[-\s.]?\d{4})/i,
    creditCard: /(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{6}[-\s]?\d{5})/i,
    ssn: /(\d{3}-\d{2}-\d{4})/i
};

// Simplified proper name regex for mock purposes (capitalized words not at start of sentence)
// In a real NLP engine, this would be handled via WASM or a local Python API.
const NAME_PATTERN = /([A-Z][a-z]+(?: [A-Z][a-z]+)*)/;

export const redactionEngine = {
    /**
     * Tokenizes a raw string into an AST (Abstract Syntax Tree) / Array of Span objects.
     * This allows us to securely map over the elements in React without dangerouslySetInnerHTML.
     */
    tokenize(rawText: string, activeRules: Record<RuleType, boolean>): Token[] {
        if (!rawText) return [];

        let tokens: Token[] = [{ id: crypto.randomUUID(), type: 'text', value: rawText }];

        // Apply each active rule sequentially to split text tokens further
        Object.entries(activeRules).forEach(([ruleKey, isActive]) => {
            if (!isActive) return;

            const rule = ruleKey as RuleType;
            const regex = rule === 'names' ? NAME_PATTERN : PATTERNS[rule as keyof typeof PATTERNS];

            if (!regex) return;

            const newTokens: Token[] = [];

            for (const token of tokens) {
                if (token.type !== 'text') {
                    // It's already been identified as a redacted entity by another rule, leave it alone.
                    newTokens.push(token);
                    continue;
                }

                // Split the plain text token by the regex pattern.
                // By wrapping the regex in capturing groups (e.g. `/(...)/`), split() retains the matched portions in the array.
                const parts = token.value.split(regex);

                for (const part of parts) {
                    if (!part) continue; // Skip empty strings

                    // Check if this specific part exactly matches the regex
                    const isMatch = part.match(new RegExp(`^${regex.source}$`, regex.flags));

                    if (isMatch) {
                        newTokens.push({ id: crypto.randomUUID(), type: rule, value: part });
                    } else {
                        newTokens.push({ id: crypto.randomUUID(), type: 'text', value: part });
                    }
                }
            }

            tokens = newTokens;
        });

        return tokens;
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
