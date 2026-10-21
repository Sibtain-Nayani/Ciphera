"""
Ciphera V3.4 — Fuzzy OCR Checksum & Syntax Recovery Engine
===========================================================
Solves OCR degradation and character misclassifications in scanned IDs:
1. Aadhaar: Verhoeff D5 group checksum with 1-character OCR confusion repair.
2. PAN: 10-char alphanumeric structural validation with digit/alpha confusion repair.
"""

from __future__ import annotations

import re
from typing import Tuple, Optional

# Dihedral group D5 multiplication table for Verhoeff
_VERHOEFF_D5_TABLE = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0)
)

_VERHOEFF_PERMUTATION = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8)
)

# Bidirectional OCR character confusions observed in Tesseract scans
_OCR_CHAR_TO_DIGIT = {
    'O': '0', 'o': '0', 'Q': '0', 'D': '0',
    'I': '1', 'l': '1', '|': '1', '!': '1', ']': '1', '[': '1',
    'Z': '2', 'z': '2',
    'S': '5', 's': '5', '$': '5',
    'b': '6', 'G': '6',
    'B': '8', '&': '8',
    'g': '9', 'q': '9'
}

_OCR_DIGIT_TO_CHAR = {
    '0': ['O', 'D'],
    '1': ['I', 'L'],
    '2': ['Z'],
    '5': ['S'],
    '6': ['G'],
    '8': ['B'],
}

VALID_PAN_4TH_CHARS = frozenset(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G'])

def compute_verhoeff_checksum(num_str: str) -> bool:
    """Standard Verhoeff D5 algorithm check."""
    if not num_str.isdigit() or len(num_str) != 12:
        return False
    if num_str[0] in ('0', '1'):
        return False

    c = 0
    for i, digit in enumerate(reversed(num_str)):
        c = _VERHOEFF_D5_TABLE[c][_VERHOEFF_PERMUTATION[i % 8][int(digit)]]
    return c == 0

class FuzzyOCRChecksumValidator:
    """Validates and recovers scanned ID credentials with OCR confusion tolerance."""

    @classmethod
    def validate_aadhaar_fuzzy(cls, raw_candidate: str) -> Tuple[bool, Optional[str], float]:
        """
        Validates Aadhaar number with single-error OCR repair.
        Returns: (is_valid, corrected_number, confidence_score)
        """
        cleaned = re.sub(r'[\s\-_/.]', '', raw_candidate)
        if len(cleaned) != 12:
            return False, None, 0.0

        # 1. Exact match pass
        if cleaned.isdigit() and compute_verhoeff_checksum(cleaned):
            return True, cleaned, 1.0

        # 2. Direct character translation pass (e.g. 'O' -> '0', 'B' -> '8')
        translated = []
        for ch in cleaned:
            if ch.isdigit():
                translated.append(ch)
            elif ch in _OCR_CHAR_TO_DIGIT:
                translated.append(_OCR_CHAR_TO_DIGIT[ch])
            else:
                translated.append(None)

        if all(x is not None for x in translated):
            trans_str = "".join(translated) # type: ignore
            if compute_verhoeff_checksum(trans_str):
                return True, trans_str, 0.95

        # 3. 1-Levenshtein OCR confusion candidate search
        # If 11 digits are valid digits, test substituting the 1 erroneous character
        valid_repairs = []
        for idx in range(12):
            orig_char = cleaned[idx]
            substitutes = []
            if orig_char in _OCR_CHAR_TO_DIGIT:
                substitutes.append(_OCR_CHAR_TO_DIGIT[orig_char])
            elif orig_char.isdigit():
                # Test digits that are commonly confused with other digits
                if orig_char == '8': substitutes.append('3')
                elif orig_char == '3': substitutes.append('8')
                elif orig_char == '5': substitutes.append('6')
                elif orig_char == '6': substitutes.append('5')
                elif orig_char == '0': substitutes.append('9')
                elif orig_char == '1': substitutes.append('7')
                elif orig_char == '7': substitutes.append('1')

            for sub in substitutes:
                cand = cleaned[:idx] + sub + cleaned[idx+1:]
                if cand.isdigit() and compute_verhoeff_checksum(cand):
                    valid_repairs.append(cand)

        if len(valid_repairs) == 1:
            return True, valid_repairs[0], 0.90

        return False, None, 0.0

    @classmethod
    def validate_pan_fuzzy(cls, raw_candidate: str) -> Tuple[bool, Optional[str], float]:
        """
        Validates 10-character PAN with OCR confusion repair.
        Format: [A-Z]{5}[0-9]{4}[A-Z]{1} with 4th char in VALID_PAN_4TH_CHARS.
        """
        cleaned = re.sub(r'[\s\-_/.]', '', raw_candidate.upper())
        if len(cleaned) != 10:
            return False, None, 0.0

        # Exact regex check
        if re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', cleaned):
            if cleaned[3] in VALID_PAN_4TH_CHARS:
                return True, cleaned, 1.0

        # Try repairing letter vs digit positions
        # Positions 0..4: Letters
        # Positions 5..8: Digits
        # Position 9: Letter
        repaired = list(cleaned)
        for i in range(5):
            if repaired[i].isdigit() and repaired[i] in _OCR_DIGIT_TO_CHAR:
                repaired[i] = _OCR_DIGIT_TO_CHAR[repaired[i]][0]

        for i in range(5, 9):
            if repaired[i] in _OCR_CHAR_TO_DIGIT:
                repaired[i] = _OCR_CHAR_TO_DIGIT[repaired[i]]

        if repaired[9].isdigit() and repaired[9] in _OCR_DIGIT_TO_CHAR:
            repaired[9] = _OCR_DIGIT_TO_CHAR[repaired[9]][0]

        rep_str = "".join(repaired)
        if re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', rep_str) and rep_str[3] in VALID_PAN_4TH_CHARS:
            return True, rep_str, 0.92

        return False, None, 0.0
