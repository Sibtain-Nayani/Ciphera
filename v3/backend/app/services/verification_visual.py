import fitz
import re
import io
from typing import List, Set
from app.schemas.document import RedactionEntity
from app.services.ocr import OCRProcessor

class VisualVerifier:
    OCR_CONFUSIONS = {
        'digit_expected': set('OoIiLlSsBbZzGgQq'),
        'letter_expected': set('01582693'),
    }

    PAN_KEYWORDS = {"pan", "permanent", "account", "income", "tax", "incometax", "card", "govt", "india", "holder", "signature"}
    AADHAAR_KEYWORDS = {"aadhaar", "uid", "uidai", "govt", "india", "unique", "identification", "enrollment", "resident", "meraaadhaar"}

    @staticmethod
    def _has_context(text_lower: str, start_idx: int, end_idx: int, keywords: Set[str]) -> bool:
        snippet = text_lower[max(0, start_idx - 120): min(len(text_lower), end_idx + 120)]
        return any(re.search(r'\b' + re.escape(kw) + r'\b', snippet) for kw in keywords)

    @staticmethod
    def _get_shape(text: str) -> str:
        shape = []
        for c in text:
            if c.isalpha(): shape.append('L')
            elif c.isdigit(): shape.append('D')
            else: shape.append('?')
        return "".join(shape)

    @staticmethod
    def _is_suspicious_pan(text: str) -> bool:
        if len(text) != 10: return False
        shape = VisualVerifier._get_shape(text)
        expected = "LLLLLDDDDL"
        mismatches = 0
        upper_letters = sum(1 for c in text if c.isupper())
        if upper_letters < 2: return False
        
        for i in range(10):
            if shape[i] != expected[i]:
                mismatches += 1
                if expected[i] == 'D' and text[i] not in VisualVerifier.OCR_CONFUSIONS['digit_expected']:
                    return False 
                if expected[i] == 'L' and text[i] not in VisualVerifier.OCR_CONFUSIONS['letter_expected']:
                    return False
        return mismatches <= 1

    @staticmethod
    def is_sku_or_compound_token(text: str, start: int, end: int) -> bool:
        """
        Determines whether a 10-char PAN candidate at text[start:end] is an embedded
        part of a larger alphanumeric token or a hyphen-connected compound identifier (SKU).
        
        A candidate is an SKU / compound token if:
        1. It is directly preceded or followed by an alphanumeric character (e.g. XABCDE1234F, ABCDE1234F9).
        2. It is preceded by a hyphen that connects to an alphanumeric prefix (e.g. PART-ABCDE1234F).
        3. It is followed by a hyphen that connects to an alphanumeric suffix (e.g. ABCDE1234F-01).
        
        A candidate is NOT an SKU (and thus a valid PAN candidate) if:
        - It is standalone (e.g. ABCDE1234F).
        - It is enclosed by punctuation (e.g. (ABCDE1234F), [ABCDE1234F], ABCDE1234F.).
        - It is enclosed or preceded/followed by hyphens acting as delimiters/bullets
          where the hyphen does NOT connect to alphanumeric tokens (e.g. -ABCDE1234F-, -ABCDE1234F, ABCDE1234F-).
        """
        # 1. Direct alphanumeric adjacency (part of a longer alphanumeric token)
        if start > 0 and text[start - 1].isalnum():
            return True
        if end < len(text) and text[end].isalnum():
            return True
            
        # 2. Hyphen-connected prefix (e.g. PART-ABCDE1234F)
        if start > 0 and text[start - 1] == '-':
            k = start - 1
            while k >= 0 and text[k] == '-':
                k -= 1
            if k >= 0 and text[k].isalnum():
                return True
                
        # 3. Hyphen-connected suffix (e.g. ABCDE1234F-01)
        if end < len(text) and text[end] == '-':
            k = end
            while k < len(text) and text[k] == '-':
                k += 1
            if k < len(text) and text[k].isalnum():
                return True
                
        return False

    @staticmethod
    def _is_suspicious_aadhaar(text: str) -> bool:
        if len(text) != 12: return False
        shape = VisualVerifier._get_shape(text)
        expected = "DDDDDDDDDDDD"
        mismatches = 0
        for i in range(12):
            if shape[i] != expected[i]:
                mismatches += 1
                if text[i] not in VisualVerifier.OCR_CONFUSIONS['digit_expected']:
                    return False
        return mismatches <= 2

    @staticmethod
    def verify(redacted_bytes: bytes, entities: List[RedactionEntity]) -> List[str]:
        leaks = []
        allowed_texts = [e.text.strip().lower() for e in entities if e.status == "rejected"]
        doc = fitz.open(stream=redacted_bytes, filetype="pdf")
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("png")
            
            ocr_text, blocks = OCRProcessor.extract_blocks(img_bytes)
            ocr_lower = ocr_text.lower()
            
            dense_chars = []
            orig_indices = []
            for i, c in enumerate(ocr_text):
                if not c.isspace():
                    dense_chars.append(c)
                    orig_indices.append(i)
                    
            dense_str = "".join(dense_chars)
            
            for length in [10, 12]:
                for i in range(len(dense_str) - length + 1):
                    window = dense_str[i:i+length]
                    
                    orig_start = orig_indices[i]
                    orig_end = orig_indices[i+length-1] + 1
                    raw_window = ocr_text[orig_start:orig_end]
                    
                    if len(raw_window) > length * 3:
                        continue
                        
                    clean_raw = raw_window.lower()
                    if clean_raw in allowed_texts:
                        continue

                    # C3 Heuristics: boundary protection against cross-word splicing and sub-string slices
                    space_count = raw_window.count(' ')
                    
                    if length == 10 and VisualVerifier._is_suspicious_pan(window):
                        # PAN cannot be a sub-slice of a longer alphanumeric or hyphen-connected compound token (SKU)
                        if VisualVerifier.is_sku_or_compound_token(ocr_text, orig_start, orig_end):
                            continue
                        # A PAN candidate cannot span 3+ whitespace-separated words (e.g. "TOTAL 1234 BILL")
                        if space_count <= 1:
                            shape = VisualVerifier._get_shape(window)
                            exact_match = (shape == "LLLLLDDDDL")
                            if exact_match:
                                # Genuine isolated or contextual PAN
                                leaks.append(f"Visual Leak (Page {page_num+1}): OCR found potential PAN structure")
                            else:
                                # Confused PAN requires supporting evidence (context keywords or contiguous token)
                                has_context = VisualVerifier._has_context(ocr_lower, orig_start, orig_end, VisualVerifier.PAN_KEYWORDS)
                                is_contiguous = (space_count == 0)
                                if has_context or is_contiguous:
                                    leaks.append(f"Visual Leak (Page {page_num+1}): OCR found potential PAN structure")
                    
                    if length == 12 and VisualVerifier._is_suspicious_aadhaar(window):
                        # Aadhaar cannot be a sub-slice of a longer digit sequence (e.g. 15-digit account number)
                        if (orig_start > 0 and ocr_text[orig_start-1].isdigit()) or (orig_end < len(ocr_text) and ocr_text[orig_end].isdigit()):
                            continue
                        # Aadhaar cannot span 4+ whitespace-separated words
                        if space_count <= 2:
                            shape = VisualVerifier._get_shape(window)
                            exact_match = (shape == "DDDDDDDDDDDD")
                            has_spaces = (' ' in raw_window or '-' in raw_window)
                            if exact_match:
                                # Isolated 4-4-4 grouping or valid 2-9 prefix
                                if has_spaces or (window[0] in "23456789"):
                                    leaks.append(f"Visual Leak (Page {page_num+1}): OCR found potential Aadhaar structure")
                                elif VisualVerifier._has_context(ocr_lower, orig_start, orig_end, VisualVerifier.AADHAAR_KEYWORDS):
                                    leaks.append(f"Visual Leak (Page {page_num+1}): OCR found potential Aadhaar structure")
                            else:
                                # Confused Aadhaar requires 4-4-4 grouping or nearby context
                                has_context = VisualVerifier._has_context(ocr_lower, orig_start, orig_end, VisualVerifier.AADHAAR_KEYWORDS)
                                if has_spaces or has_context:
                                    leaks.append(f"Visual Leak (Page {page_num+1}): OCR found potential Aadhaar structure")

        doc.close()
        return leaks
