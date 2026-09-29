from fastapi import HTTPException
from app.services.verification_geometry import GeometryVerifier
from app.services.verification_visual import VisualVerifier
from app.schemas.document import RedactionEntity
from typing import List
import re

class VerificationEngine:
    """
    Phase 7: Independent Layered Verification Engine
    Layer 1: Geometric Verifier (Are native text objects left behind in the redacted rects?)
    Layer 2: Visual Verifier (Render to pixels -> OCR -> permissive residual structural scan)
    Layer 3: Regex Verifier (Fallback to catch non-visual text structures like generic phones/emails)
    """

    @staticmethod
    def verify_redacted_file(file_bytes: bytes, filename: str, original_entities: List[RedactionEntity] = None) -> bool:
        if original_entities is None:
            original_entities = []
            
        leaks = []
        
        # Layer 1: Geometry
        geometry_leaks = GeometryVerifier.verify(file_bytes, original_entities)
        leaks.extend(geometry_leaks)
        
        # Layer 2: Visual
        visual_leaks = VisualVerifier.verify(file_bytes, original_entities)
        leaks.extend(visual_leaks)
        
        # Layer 3: Regex Verification
        from app.services.document_parser import DocumentParser
        canonical_doc = DocumentParser.parse(file_bytes, filename)
        text_to_audit = canonical_doc.full_text
        
        AUDIT_PATTERNS = {
            "EMAIL": re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'),
            "PAN_CARD": re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b', re.IGNORECASE),
            "AADHAAR": re.compile(r'\b\d{4}[ -]?\d{4}[ -]?\d{4}\b'),
            "CREDIT_CARD": re.compile(r'\b(?:\d[ -]*?){13,16}\b'),
            "PHONE_GENERIC": re.compile(r'\b(?:\+?91[-. ]?)?[6789]\d{9}\b'),
        }
        allowed_texts = [e.text.strip().lower() for e in original_entities if e.status == "rejected"]
        
        for entity_type, pattern in AUDIT_PATTERNS.items():
            for match in pattern.findall(text_to_audit):
                clean_match = str(match).strip()
                if clean_match.lower() not in allowed_texts:
                    leaks.append(f"Regex Leak: {entity_type} ({clean_match})")
                    
        # Layer 3.5: Defragmented Regex (Spatial Fragmentation)
        dense_chars = []
        orig_indices = []
        for i, c in enumerate(text_to_audit):
            if not c.isspace():
                dense_chars.append(c)
                orig_indices.append(i)
        dense_text = "".join(dense_chars)
        
        for entity_type, pattern in AUDIT_PATTERNS.items():
            if entity_type not in ["PAN_CARD", "AADHAAR"]: continue
            raw_pattern = pattern.pattern.replace(r'\b', '')
            for match in re.finditer(raw_pattern, dense_text, re.IGNORECASE):
                dense_match = match.group(0)
                orig_start = orig_indices[match.start()]
                orig_end = orig_indices[match.end()-1] + 1
                raw_window = text_to_audit[orig_start:orig_end]
                # If it's highly spaced, it's a fragmentation leak
                if len(raw_window) > len(dense_match) + 2:
                    if raw_window.lower().replace(" ", "") not in [t.replace(" ", "") for t in allowed_texts]:
                        leaks.append(f"Regex Defrag Leak: {entity_type} ({raw_window})")
        
        if leaks:
            detail_msg = f"Verification failed: {len(leaks)} leaks found post-redaction. First few: {', '.join(leaks[:3])}"
            raise HTTPException(status_code=500, detail=detail_msg)
            
        return True
