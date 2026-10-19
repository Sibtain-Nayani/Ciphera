from fastapi import HTTPException
from app.services.verification_geometry import GeometryVerifier
from app.services.verification_visual import VisualVerifier
from app.schemas.document import RedactionEntity
from typing import List
import re
import fitz
import cv2
import numpy as np


class VerificationFailure(HTTPException):
    """Raised when definitive residual PII leaks are detected post-redaction."""
    def __init__(self, detail: str, leaks: List[str] = None):
        super().__init__(status_code=500, detail=detail)
        self.leaks = leaks or []


class VerificationUncertainty(HTTPException):
    """Raised when a document or page contains visual content that could not be inspected or verified with confidence."""
    def __init__(self, detail: str, uninspected_pages: List[int] = None):
        super().__init__(status_code=422, detail=detail)
        self.uninspected_pages = uninspected_pages or []

class VerificationEngine:
    """
    Phase 7: Independent Layered Verification Engine
    Layer 1: Geometric Verifier (Are native text objects left behind in the redacted rects?)
    Layer 2: Visual Verifier (Render to pixels -> OCR -> permissive residual structural scan)
    Layer 3: Regex Verifier (Fallback to catch non-visual text structures like generic phones/emails)
    """

    @staticmethod
    def sanitize_error_string(message: str) -> str:
        """
        Scrubs any accidental sensitive tokens (PAN, Aadhaar, phone, email, credit card)
        from error strings before storing in DB or returning in API responses.
        """
        if not message:
            return ""
        # Scrub emails
        message = re.sub(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '[REDACTED_EMAIL]', message)
        # Scrub credit cards (13-19 digits, before Aadhaar to prevent prefix matching)
        message = re.sub(r'\b(?:\d[ -]*?){13,19}\b', '[REDACTED_CARD]', message)
        # Scrub PAN
        message = re.sub(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b', '[REDACTED_PAN]', message, flags=re.IGNORECASE)
        # Scrub Aadhaar (including spaced/hyphenated)
        message = re.sub(r'\b\d{4}[ -]?\d{4}[ -]?\d{4}\b', '[REDACTED_AADHAAR]', message)
        # Scrub 10-digit phones
        message = re.sub(r'\b(?:\+?91[-. ]?)?[6789]\d{9}\b', '[REDACTED_PHONE]', message)
        return message

    @staticmethod
    def luhn_checksum_valid(number_str: str) -> bool:
        """
        Validates candidate card digits using the Luhn (Mod-10) algorithm.
        Note: Luhn is a card-number validation signal, not a universal PII validation rule.
        """
        digits = [int(c) for c in number_str if c.isdigit()]
        if len(digits) < 13 or len(digits) > 19:
            return False
        checksum = 0
        reverse_digits = digits[::-1]
        for i, d in enumerate(reverse_digits):
            if i % 2 == 1:
                doubled = d * 2
                checksum += (doubled - 9 if doubled > 9 else doubled)
            else:
                checksum += d
        return checksum % 10 == 0

    @staticmethod
    def verify_redacted_file(file_bytes: bytes, filename: str, original_entities: List[RedactionEntity] = None) -> bool:
        if original_entities is None:
            original_entities = []
            
        # Phase 7.0: Fail-Closed Uncertainty Gate
        # Every page must reach an acceptable, verified inspection state.
        # Image-only pages with visible content that cannot be read or verified with confidence
        # must trigger uncertainty failure and route to manual review.
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        uncertainties = []
        uninspected_pages = []
        for page_idx in range(len(doc)):
            page_num = page_idx + 1
            page = doc[page_idx]
            page_text = re.sub(r'\s+', '', page.get_text("text") or '')
            has_native_text = len(page_text) > 0
            
            if not has_native_text:
                # Scanned / Image-only page
                try:
                    pix = page.get_pixmap(dpi=150)
                    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))
                    if pix.n >= 3:
                        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
                    else:
                        gray = arr.squeeze()
                    
                    std_dev = float(np.std(gray))
                    non_white_ratio = float(np.mean(gray < 240))
                    edges = cv2.Canny(gray, 50, 150)
                    edge_ratio = float(np.mean(edges > 0))
                    
                    # Distinguish genuine blank page from page with visual ink/content
                    has_visual_content = (edge_ratio > 0.0005 or (std_dev > 1.5 and non_white_ratio > 0.001))
                except Exception as e:
                    uncertainties.append(f"Uncertainty Failure (Page {page_num}): Page visual rendering failed ({type(e).__name__})")
                    uninspected_pages.append(page_num)
                    continue
                
                if has_visual_content:
                    img_bytes = pix.tobytes("png")
                    from app.services.ocr import OCRProcessor
                    try:
                        ocr_text, ocr_blocks, ocr_stats = OCRProcessor.extract_blocks_with_stats(img_bytes, page_num=page_num)
                    except Exception as ocr_err:
                        uncertainties.append(
                            f"Uncertainty Failure (Page {page_num}): OCR extraction engine error ({type(ocr_err).__name__})"
                        )
                        uninspected_pages.append(page_num)
                        continue
                    
                    alnum_chars = ocr_stats.get("alphanumeric_char_count", 0)
                    word_count = ocr_stats.get("word_count", 0)
                    mean_conf = ocr_stats.get("mean_confidence")
                    total_chars = ocr_stats.get("total_char_count", 0)
                    
                    # Assessment of OCR inspection readability:
                    # 1. Zero alphanumeric yield
                    if alnum_chars == 0:
                        uncertainties.append(
                            f"Uncertainty Failure (Page {page_num}): Page contains visual content but OCR yielded zero alphanumeric characters"
                        )
                        uninspected_pages.append(page_num)
                    # 2. Negligible yield on page with clear visual ink/content (e.g. 1-3 alnum chars on substantial visual ink)
                    elif alnum_chars <= 3 and (non_white_ratio > 0.003 or edge_ratio > 0.001):
                        uncertainties.append(
                            f"Uncertainty Failure (Page {page_num}): Negligible OCR yield ({alnum_chars} chars) on page with substantial visual content"
                        )
                        uninspected_pages.append(page_num)
                    # 3. Low confidence garbled yield
                    elif mean_conf is not None and mean_conf < 45.0 and (alnum_chars < 15 or word_count <= 3):
                        uncertainties.append(
                            f"Uncertainty Failure (Page {page_num}): OCR extraction quality too low (confidence {mean_conf:.1f}%)"
                        )
                        uninspected_pages.append(page_num)
                    # 4. Garbled non-alphanumeric noise (predominantly punctuation/symbols relative to alphanumeric)
                    elif total_chars > 0 and (alnum_chars / max(1, total_chars) < 0.25) and alnum_chars <= 6:
                        uncertainties.append(
                            f"Uncertainty Failure (Page {page_num}): Garbled OCR output (predominantly non-alphanumeric noise)"
                        )
                        uninspected_pages.append(page_num)
        if uncertainties:
            doc.close()
            detail_msg = f"Verification uncertainty: {len(uncertainties)} page(s) uninspected. [{'; '.join(uncertainties[:3])}]"
            detail_msg = VerificationEngine.sanitize_error_string(detail_msg)
            raise VerificationUncertainty(detail=detail_msg, uninspected_pages=uninspected_pages)

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
            "PAN_CARD": re.compile(r'(?<![A-Za-z0-9])(?<![A-Za-z0-9]-)[A-Z]{5}[0-9]{4}[A-Z](?!-[A-Za-z0-9])(?![A-Za-z0-9])', re.IGNORECASE),
            "AADHAAR": re.compile(r'\b\d{4}[ -]?\d{4}[ -]?\d{4}\b'),
            "CREDIT_CARD": re.compile(r'\b(?:\d[ -]*?){13,19}\b'),
            "PHONE_GENERIC": re.compile(r'\b(?:\+?91[-. ]?)?[6789]\d{9}\b'),
        }
        allowed_texts = [e.text.strip().lower() for e in original_entities if e.status == "rejected"]
        
        for entity_type, pattern in AUDIT_PATTERNS.items():
            for match in pattern.finditer(text_to_audit):
                clean_match = match.group(0).strip()
                if clean_match.lower() in allowed_texts:
                    continue
                if entity_type == "PAN_CARD":
                    if VisualVerifier.is_sku_or_compound_token(text_to_audit, match.start(), match.end()):
                        continue
                elif entity_type == "CREDIT_CARD":
                    # C2: Luhn Validation (card-number validation signal)
                    digits_only = re.sub(r'\D', '', clean_match)
                    if not VerificationEngine.luhn_checksum_valid(digits_only):
                        continue
                leaks.append(f"Regex Leak: {entity_type} pattern detected")
                    
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
            raw_pattern = r'[A-Z]{5}[0-9]{4}[A-Z]' if entity_type == "PAN_CARD" else pattern.pattern.replace(r'\b', '')
            for match in re.finditer(raw_pattern, dense_text, re.IGNORECASE):
                dense_match = match.group(0)
                orig_start = orig_indices[match.start()]
                orig_end = orig_indices[match.end()-1] + 1
                raw_window = text_to_audit[orig_start:orig_end]
                # P2: Ensure candidate is not part of a hyphenated SKU or longer alphanumeric token
                if entity_type == "PAN_CARD":
                    if VisualVerifier.is_sku_or_compound_token(text_to_audit, orig_start, orig_end):
                        continue
                # If it's highly spaced, it's a fragmentation leak
                if len(raw_window) > len(dense_match) + 2:
                    if raw_window.lower().replace(" ", "") not in [t.replace(" ", "") for t in allowed_texts]:
                        leaks.append(f"Regex Defrag Leak: {entity_type} pattern detected")

        # Layer 3.6: Accepted Entity Residual Fragment Scan (C4 Spatially Scoped)
        # Confined to the exact page and spatial neighborhood of the modified/redacted entity.
        # Catches clipped bounding boxes where a partial prefix or suffix of an accepted entity
        # remains unredacted in the nearby text stream, without falsely rejecting identical substrings
        # in unrelated sections, different columns, or other pages.
        clean_text_stream = re.sub(r'\s+', '', text_to_audit)
        for ent in original_entities:
            if ent.status not in ["pending", "accepted", "modified"]:
                continue
            ent_clean = re.sub(r'\s+', '', ent.text or '')
            if len(ent_clean) < 6:
                continue

            prefixes = [ent_clean[:k] for k in range(4, min(7, len(ent_clean)))]
            suffixes = [ent_clean[-k:] for k in range(4, min(7, len(ent_clean)))]

            if not ent.bbox or ent.page_num < 1 or ent.page_num > len(doc):
                # Spatial correspondence is missing or uncertain:
                # Retain conservative verification outcome across text stream
                for suffix in suffixes:
                    if suffix in clean_text_stream:
                        leaks.append(f"Fragment Leak: Residual trailing characters of {ent.entity_type} detected (uncertain bbox)")
                        break
                for prefix in prefixes:
                    if prefix in clean_text_stream:
                        leaks.append(f"Fragment Leak: Residual leading characters of {ent.entity_type} detected (uncertain bbox)")
                        break
                continue

            # Spatially scoped check on entity's exact page
            page = doc[ent.page_num - 1]
            
            # Check for rotated page uncertainty: if rotated, coordinates may not map reliably
            if page.rotation != 0:
                page_text_clean = re.sub(r'\s+', '', page.get_text("text") or '')
                for suffix in suffixes:
                    if suffix in page_text_clean:
                        leaks.append(f"Fragment Leak (Page {ent.page_num}): Residual trailing characters of {ent.entity_type} detected (rotated page)")
                        break
                for prefix in prefixes:
                    if prefix in page_text_clean:
                        leaks.append(f"Fragment Leak (Page {ent.page_num}): Residual leading characters of {ent.entity_type} detected (rotated page)")
                        break
                continue

            box_h = max(ent.bbox.y1 - ent.bbox.y0, 10.0)
            
            # Search envelope: expand 100pt horizontally, max(box_h * 1.5, 15pt) vertically
            search_delta_h = max(box_h * 1.5, 15.0)
            search_delta_w = 100.0
            local_rect = fitz.Rect(
                max(0.0, ent.bbox.x0 - search_delta_w),
                max(0.0, ent.bbox.y0 - search_delta_h),
                ent.bbox.x1 + search_delta_w,
                ent.bbox.y1 + search_delta_h
            )
            local_text = page.get_text("text", clip=local_rect) or ''
            clean_local = re.sub(r'\s+', '', local_text)

            for suffix in suffixes:
                if suffix in clean_local:
                    leaks.append(f"Fragment Leak (Page {ent.page_num}): Residual trailing characters of {ent.entity_type} detected near bbox")
                    break

            for prefix in prefixes:
                if prefix in clean_local:
                    leaks.append(f"Fragment Leak (Page {ent.page_num}): Residual leading characters of {ent.entity_type} detected near bbox")
                    break

        doc.close()
        
        if leaks:
            detail_msg = f"Verification failed: {len(leaks)} leak(s) detected post-redaction. [{'; '.join(leaks[:3])}]"
            detail_msg = VerificationEngine.sanitize_error_string(detail_msg)
            raise VerificationFailure(detail=detail_msg, leaks=leaks)
            
        return True
