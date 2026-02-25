# Project Backlog & Critical Decisions

## Text Redaction Engine (Phase 3)
- **Tokenization Strategy:** AST (Abstract Syntax Tree) / Array of Span objects (`Approach B`).
- **Status:** Approved by User, but deferred.
- **Reason:** Prioritizing global UI/UX scaffolding and page layout generation first.
- **Implementation Note:** When we return to this, we must build `src/lib/redactionEngine.ts` to tokenize raw text strings into a `Token[]` array before rendering them securely in React to prevent XSS and allow Framer Motion animations.
