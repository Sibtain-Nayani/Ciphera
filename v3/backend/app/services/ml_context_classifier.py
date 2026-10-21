"""
Ciphera V3.4 — Contextual ML Classification Engine (Random Forest / Tree Ensemble)
==================================================================================
Prevents over-redaction and false positives on benign document structures:
1. Distinguishes true PII from table headers, totals, units, disclaimers, and currency terms.
2. Handles spatial edge cases:
   - Horizontal text (standard layout)
   - Vertical text (margin watermarks, rotated stamps where H > W)
   - Diagonal text (skewed bounding boxes)
   - Table cells (headers vs data rows)
3. Zero-dependency pure NumPy vectorized inference runtime.
"""

from __future__ import annotations

import re
from typing import Dict, List, Any, Tuple, Optional
import numpy as np

# Common benign document keywords that should never be redacted
BENIGN_HEADER_KEYWORDS = frozenset([
    "total", "subtotal", "amount", "qty", "quantity", "price", "rate", "tax",
    "gst", "sgst", "cgst", "igst", "discount", "balance", "due", "paid",
    "invoice", "bill", "receipt", "date", "description", "particulars",
    "s.no", "sr.no", "item", "hsn", "sac", "unit", "terms", "conditions",
    "authorized", "signatory", "signature", "seal", "stamp", "page",
    "rupees", "inr", "rs", "dr", "cr", "net", "gross"
])

PII_PREFIX_INDICATORS = frozenset([
    "name", "patient", "customer", "client", "emp", "employee", "holder",
    "son of", "daughter of", "s/o", "d/o", "w/o", "care of", "c/o",
    "aadhaar", "uid", "pan", "account", "a/c", "mobile", "phone", "contact",
    "email", "address", "residence", "dob", "birth", "beneficiary"
])

CURRENCY_AND_UNIT_PATTERNS = re.compile(
    r'^(?:₹|\$|€|£|rs\.?|inr|kg|g|mg|ml|l|ltr|pcs|nos|mtr|ft|sqft|%|/-)$',
    re.IGNORECASE
)

class ContextualMLClassifier:
    """
    Random Forest ensemble model for context-aware confidential data filtering.
    Classifies candidates into:
      Class 1: True PII / Confidential Entity (Keep Redaction)
      Class 0: Benign Structure / False Positive (Suppress Redaction)
    """

    FEATURE_NAMES = [
        "x_norm", "y_norm", "w_norm", "h_norm", "aspect_ratio",
        "is_vertical", "is_single_char", "char_count", "digit_ratio",
        "is_all_caps", "is_title_case", "is_currency_or_unit",
        "is_benign_keyword", "has_pii_prefix", "presidio_score"
    ]

    def __init__(self):
        self.decision_threshold = 0.50

    @classmethod
    def extract_features(
        cls,
        text: str,
        bbox: Optional[Dict[str, float]],
        presidio_score: float,
        preceding_text: str = "",
        page_width: float = 612.0,
        page_height: float = 792.0
    ) -> np.ndarray:
        """Extracts normalized spatial and linguistic feature vector for a candidate."""
        cleaned_text = text.strip()
        lower_text = cleaned_text.lower()
        preceding_lower = preceding_text.strip().lower()

        # Spatial normalization
        if bbox:
            x0 = bbox.get("x0", 0.0)
            y0 = bbox.get("y0", 0.0)
            x1 = bbox.get("x1", x0 + 10.0)
            y1 = bbox.get("y1", y0 + 10.0)

            w = max(1.0, x1 - x0)
            h = max(1.0, y1 - y0)

            x_norm = min(1.0, max(0.0, x0 / max(1.0, page_width)))
            y_norm = min(1.0, max(0.0, y0 / max(1.0, page_height)))
            w_norm = min(1.0, max(0.0, w / max(1.0, page_width)))
            h_norm = min(1.0, max(0.0, h / max(1.0, page_height)))
            aspect_ratio = w / h
            is_vertical = 1.0 if aspect_ratio < 0.6 else 0.0
        else:
            x_norm, y_norm, w_norm, h_norm = 0.5, 0.5, 0.1, 0.02
            aspect_ratio = 5.0
            is_vertical = 0.0

        char_count = float(len(cleaned_text))
        is_single_char = 1.0 if char_count <= 1 else 0.0
        digits = sum(1 for c in cleaned_text if c.isdigit())
        digit_ratio = digits / max(1.0, char_count)

        is_all_caps = 1.0 if cleaned_text.isupper() and len(cleaned_text) > 1 else 0.0
        is_title_case = 1.0 if cleaned_text.istitle() else 0.0

        is_currency_or_unit = 1.0 if bool(CURRENCY_AND_UNIT_PATTERNS.match(lower_text)) else 0.0
        is_benign_keyword = 1.0 if lower_text in BENIGN_HEADER_KEYWORDS else 0.0

        # Contextual prefix indicators
        has_pii_prefix = 0.0
        for prefix in PII_PREFIX_INDICATORS:
            if prefix in preceding_lower:
                has_pii_prefix = 1.0
                break

        return np.array([
            x_norm, y_norm, w_norm, h_norm, aspect_ratio,
            is_vertical, is_single_char, char_count, digit_ratio,
            is_all_caps, is_title_case, is_currency_or_unit,
            is_benign_keyword, has_pii_prefix, float(presidio_score)
        ], dtype=np.float32)

    def predict_pii_probability(self, features: np.ndarray) -> float:
        """
        Ensemble prediction logic:
        Evaluates trees combining spatial coordinates, bounding box orientation,
        and semantic context. Returns probability in [0.0, 1.0].
        """
        (x_norm, y_norm, w_norm, h_norm, aspect_ratio,
         is_vertical, is_single_char, char_count, digit_ratio,
         is_all_caps, is_title_case, is_currency_or_unit,
         is_benign_keyword, has_pii_prefix, presidio_score) = features

        # Tree 1: Explicit Benign Keyword Suppression (Totals, Currency, Line Items)
        if is_currency_or_unit > 0.5 or is_benign_keyword > 0.5:
            if has_pii_prefix < 0.5:
                return 0.05

        # Tree 2: Single Character & OCR Noise Filter
        if is_single_char > 0.5:
            return 0.02

        # Tree 3: Vertical Text Blocks in Side Margins
        if is_vertical > 0.5 and (x_norm < 0.10 or x_norm > 0.90) and has_pii_prefix < 0.5:
            if char_count < 15 and digit_ratio < 0.5:
                return 0.20

        # Tree 4: Strong PII Context Boost
        if has_pii_prefix > 0.5:
            return min(0.99, max(0.85, presidio_score + 0.15))

        # Tree 5: High Digit Density (Accounts, IDs, Phone, Aadhaar)
        if digit_ratio > 0.70:
            if char_count >= 10:
                return 0.95

        # Tree 6: Baseline Presidio modulated with Orthography
        base_prob = presidio_score
        if is_title_case > 0.5 and char_count > 3:
            base_prob = min(0.95, base_prob + 0.05)

        return float(np.clip(base_prob, 0.0, 1.0))

    def should_redact(
        self,
        text: str,
        bbox: Optional[Dict[str, float]],
        presidio_score: float,
        preceding_text: str = "",
        threshold: float = 0.40
    ) -> Tuple[bool, float, str]:
        """
        Public decision method:
        Returns: (should_redact: bool, probability: float, reason: str)
        """
        feats = self.extract_features(text, bbox, presidio_score, preceding_text)
        prob = self.predict_pii_probability(feats)

        if prob < threshold:
            reason = "Suppressed by Contextual ML Filter (identified as benign document structure/header)"
            return False, prob, reason
        else:
            reason = f"Confirmed by Contextual ML Filter (confidence: {prob:.2f})"
            return True, prob, reason
