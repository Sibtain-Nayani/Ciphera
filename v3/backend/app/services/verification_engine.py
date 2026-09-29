import re
from fastapi import HTTPException
from app.services.document_parser import DocumentParser

class VerificationEngine:
    """
    Phase 7: Independent Verification Engine
    Acts as a zero-trust auditor. Does NOT rely on Presidio/spaCy.
    Uses aggressive, high-recall regex and checksums to ensure nothing leaked.
    """
    
    # Aggressive, high-recall patterns independent of the main detection engine
    AUDIT_PATTERNS = {
        "EMAIL": re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'),
        "PAN_CARD": re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b', re.IGNORECASE),
        "AADHAAR": re.compile(r'\b\d{4}[ -]?\d{4}[ -]?\d{4}\b'),
        "CREDIT_CARD": re.compile(r'\b(?:\d[ -]*?){13,16}\b'),
        "PHONE_GENERIC": re.compile(r'\b(?:\+?91[-. ]?)?[6789]\d{9}\b'),
    }

    @staticmethod
    def _passes_luhn(card_number: str) -> bool:
        digits = [int(c) for c in card_number if c.isdigit()]
        if len(digits) < 13:
            return False
        checksum = 0
        reverse_digits = digits[::-1]
        for i, d in enumerate(reverse_digits):
            if i % 2 == 1:
                d *= 2
                if d > 9:
                    d -= 9
            checksum += d
        return checksum % 10 == 0
        
    @staticmethod
    def _is_valid_pan(pan: str) -> bool:
        # PAN structure: 5 letters, 4 digits, 1 letter.
        # The 4th letter is usually P, C, H, A, B, G, J, L, F, T
        pan = pan.upper().replace(" ", "").replace("-", "")
        if len(pan) != 10:
            return False
        return pan[3] in 'PCHABGJLFT'

    @staticmethod
    def verify_redacted_file(file_bytes: bytes, filename: str, original_entities: list = None) -> bool:
        # Parse the redacted file to get the raw text left behind
        canonical_doc = DocumentParser.parse(file_bytes, filename)
        text_to_audit = canonical_doc.full_text
        
        if original_entities is None:
            original_entities = []
            
        # Entities that were explicitly rejected (meaning the user WANTED them to remain visible)
        allowed_texts = [e.text.strip().lower() for e in original_entities if e.status == "rejected"]
        
        leaked_findings = []
        
        # 1. Audit against aggressive regex
        for entity_type, pattern in VerificationEngine.AUDIT_PATTERNS.items():
            matches = pattern.findall(text_to_audit)
            for match in matches:
                clean_match = str(match).strip()
                
                # Filter out allowed text
                if clean_match.lower() in allowed_texts:
                    continue
                    
                # Secondary logical checks to reduce false positives from high-recall regex
                is_leak = False
                
                if entity_type == "CREDIT_CARD":
                    if VerificationEngine._passes_luhn(clean_match):
                        is_leak = True
                elif entity_type == "PAN_CARD":
                    if VerificationEngine._is_valid_pan(clean_match):
                        is_leak = True
                else:
                    # Emails, Aadhaar, Phone are treated as leaks if they match the strict regex
                    is_leak = True
                    
                if is_leak:
                    leaked_findings.append(f"{entity_type} ({clean_match})")
                    
        if leaked_findings:
            # We found something that looks like sensitive data in the output file!
            raise HTTPException(
                status_code=500, 
                detail=f"Verification failed: {len(leaked_findings)} entities leaked post-redaction: {', '.join(leaked_findings[:3])}..."
            )
            
        return True
