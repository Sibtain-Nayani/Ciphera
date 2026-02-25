# Project Backlog & Critical Decisions

## Text Redaction Engine (Phase 3)
- **Tokenization Strategy:** AST (Abstract Syntax Tree) / Array of Span objects (`Approach B`).
- **Status:** Approved by User, but deferred.
- **Reason:** Prioritizing global UI/UX scaffolding and page layout generation first.
- **Implementation Note:** When we return to this, we must build `src/lib/redactionEngine.ts` to tokenize raw text strings into a `Token[]` array before rendering them securely in React to prevent XSS and allow Framer Motion animations.

## Document Processing (Future Enhancements)
- **Deep XML Parsing for DOCX:** Currently, DOCX parsing leverages `mammoth` which extracts raw text but strips visual formatting. To implement true "preservation-of-format" redaction for `.docx` files, we need to build a specialized flow: Unzip the `.docx` archive in the browser -> run the Presidio Scanner strictly on the internal `document.xml` `<w:t>` (text) nodes -> replace matched nodes -> repackage the Zip and export. This will ensure 100% format preservation without resorting to visual canvas generation.
