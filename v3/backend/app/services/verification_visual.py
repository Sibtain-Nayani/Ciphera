import fitz
import re
import io
from typing import List
from app.schemas.document import RedactionEntity
from app.services.ocr import OCRProcessor

class VisualVerifier:
    OCR_CONFUSIONS = {
        'digit_expected': set('OoIiLlSsBbZzGgQq'),  # Letters that look like digits
        'letter_expected': set('01582693'),         # Digits that look like letters (added 3 for B/E)
    }

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
        
        # PANs are usually uppercase or mixed if OCR fails, but not entirely lowercase
        # But to be safe, let's just check shape mismatches strictly.
        shape = VisualVerifier._get_shape(text)
        expected = "LLLLLDDDDL"
        mismatches = 0
        
        # Reject if it doesn't have at least SOME uppercase letters (PANs have 6 letters)
        upper_letters = sum(1 for c in text if c.isupper())
        if upper_letters < 2: return False
        
        for i in range(10):
            if shape[i] != expected[i]:
                mismatches += 1
                if expected[i] == 'D' and text[i] not in VisualVerifier.OCR_CONFUSIONS['digit_expected']:
                    return False 
                if expected[i] == 'L' and text[i] not in VisualVerifier.OCR_CONFUSIONS['letter_expected']:
                    return False
        
        # Max 1 OCR substitution allowed, otherwise it causes too many false positives on random text
        return mismatches <= 1

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
        doc = fitz.open(stream=redacted_bytes, filetype="pdf")
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("png")
            
            ocr_text, blocks = OCRProcessor.extract_blocks(img_bytes)
            
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
                        
                    if length == 10 and VisualVerifier._is_suspicious_pan(window):
                        leaks.append(f"Visual Leak (Page {page_num+1}): OCR found potential PAN '{raw_window}'")
                    
                    if length == 12 and VisualVerifier._is_suspicious_aadhaar(window):
                        has_spaces = ' ' in raw_window or '-' in raw_window
                        has_errors = any(c.isalpha() for c in window)
                        
                        if has_spaces or has_errors:
                            leaks.append(f"Visual Leak (Page {page_num+1}): OCR found potential Aadhaar '{raw_window}'")

        doc.close()
        return leaks
