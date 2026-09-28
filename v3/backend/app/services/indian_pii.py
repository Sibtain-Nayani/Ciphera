import re

# Devanagari numerals to ASCII digits
DEVANAGARI_DIGITS = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
}

# Verhoeff algorithm tables
VERHOEFF_D = (
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
VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8)
)
VERHOEFF_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)

def normalize_devanagari(text: str) -> str:
    """Converts Devanagari digits to ASCII digits for robust OCR matching."""
    return ''.join(DEVANAGARI_DIGITS.get(char, char) for char in text)

def is_valid_aadhaar(aadhaar_str: str) -> bool:
    """
    Validates a 12-digit Aadhaar number using the Verhoeff algorithm.
    """
    # Remove non-digits
    digits = re.sub(r'\D', '', aadhaar_str)
    if len(digits) != 12:
        return False
        
    c = 0
    reversed_digits = [int(n) for n in reversed(digits)]
    
    for i, num in enumerate(reversed_digits):
        c = VERHOEFF_D[c][VERHOEFF_P[i % 8][num]]
        
    return c == 0

def is_valid_pan(pan_str: str) -> bool:
    """
    Validates Indian PAN structure:
    - 5 uppercase letters
    - 4 digits
    - 1 uppercase letter
    - 4th letter represents status (P=Person, C=Company, etc.)
    """
    pan_str = pan_str.strip().upper()
    if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan_str):
        return False
        
    # The 4th character denotes the type of holder. Valid values:
    # A, B, C, F, G, H, J, L, P, T, K, E
    holder_status = pan_str[3]
    valid_statuses = {'A', 'B', 'C', 'F', 'G', 'H', 'J', 'L', 'P', 'T', 'K', 'E'}
    
    if holder_status not in valid_statuses:
        return False
        
    return True
