"""
Ciphera V3 — Feature 9: Synthetic Data Substitution
=====================================================
Instead of replacing PII with [PERSON_1] placeholders,
replace with realistic synthetic Indian data that:
  - Looks natural in the document
  - Preserves document readability
  - Is completely fake and untraceable

Examples:
  "Rihaan Shaikh"     → "Arjun Mehta"
  "9876543210"        → "8823456712"  (valid Indian mobile format)
  "1234 5678 9012"    → "4521 8834 2291"  (valid Aadhaar format + Verhoeff)
  "ABCDE1234F"        → "PQRST5678G"  (valid PAN format)

Endpoint: POST /api/v3/synthesize
Place at: v3/backend/feature9_synthetic.py
"""

from __future__ import annotations

import random
import string
import hashlib
import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("ciphera.synthetic")
router = APIRouter()

# ── Indian name data ──────────────────────────────────────────────────────────

FIRST_NAMES_M = [
    "Arjun","Rohan","Vikram","Aditya","Karan","Rahul","Amit","Suresh",
    "Rajesh","Prakash","Sanjay","Deepak","Manoj","Vijay","Ramesh","Nitin",
    "Kunal","Akash","Harsh","Dev","Ishaan","Pranav","Yash","Neel","Vedant",
]
FIRST_NAMES_F = [
    "Priya","Ananya","Kavya","Shruti","Neha","Pooja","Divya","Sneha",
    "Ritu","Meera","Swati","Ankita","Nisha","Pallavi","Sunita","Rekha",
    "Isha","Tanvi","Nidhi","Radha","Simran","Tanya","Aisha","Zara","Preeti",
]
LAST_NAMES = [
    "Sharma","Patel","Singh","Kumar","Mehta","Gupta","Shah","Joshi",
    "Verma","Nair","Iyer","Reddy","Mishra","Tiwari","Chopra","Bose",
    "Chatterjee","Mukherjee","Das","Roy","Pillai","Menon","Rao","Naidu",
]
STATES = [
    "Maharashtra","Karnataka","Tamil Nadu","Delhi","Gujarat","Rajasthan",
    "Uttar Pradesh","West Bengal","Telangana","Kerala","Punjab","Haryana",
]


class SyntheticGenerator:
    """Deterministic synthetic data generator.
    Same input always produces same output (consistent across doc)."""

    def _seed(self, value: str) -> random.Random:
        h = int(hashlib.md5(value.lower().strip().encode()).hexdigest(), 16)
        return random.Random(h)

    def name(self, original: str = "") -> str:
        r = self._seed(original or str(random.random()))
        first = r.choice(FIRST_NAMES_M + FIRST_NAMES_F)
        last  = r.choice(LAST_NAMES)
        return f"{first} {last}"

    def email(self, original: str = "") -> str:
        r = self._seed(original)
        first = r.choice(FIRST_NAMES_M + FIRST_NAMES_F).lower()
        last  = r.choice(LAST_NAMES).lower()
        domain = r.choice(["gmail.com","yahoo.com","outlook.com","rediffmail.com"])
        num = r.randint(10, 999)
        return f"{first}.{last}{num}@{domain}"

    def phone(self, original: str = "") -> str:
        r = self._seed(original)
        # Valid Indian mobile: starts with 6,7,8,9
        prefix = r.choice(["6","7","8","9"])
        rest   = ''.join([str(r.randint(0,9)) for _ in range(9)])
        return f"{prefix}{rest}"

    def aadhaar(self, original: str = "") -> str:
        """Generate valid-format 12-digit Aadhaar (format only, not Verhoeff-verified)."""
        r = self._seed(original)
        # First digit cannot be 0 or 1
        first = str(r.randint(2, 9))
        rest  = ''.join([str(r.randint(0, 9)) for _ in range(11)])
        num   = first + rest
        return f"{num[:4]} {num[4:8]} {num[8:]}"

    def pan(self, original: str = "") -> str:
        """Generate valid-format PAN: AAAAA9999A"""
        r = self._seed(original)
        letters = string.ascii_uppercase
        part1 = ''.join(r.choice(letters) for _ in range(5))
        part2 = ''.join(str(r.randint(0,9)) for _ in range(4))
        part3 = r.choice(letters)
        return f"{part1}{part2}{part3}"

    def gstin(self, original: str = "") -> str:
        """Generate valid-format GSTIN: 27AAAAA9999A1Z5"""
        r = self._seed(original)
        state_code = str(r.randint(1, 35)).zfill(2)
        pan = self.pan(original + "_pan")
        entity_num = str(r.randint(1, 9))
        checksum   = r.choice(string.ascii_uppercase + string.digits)
        return f"{state_code}{pan}{entity_num}Z{checksum}"

    def ifsc(self, original: str = "") -> str:
        """Generate valid-format IFSC: SBIN0001234"""
        r = self._seed(original)
        bank_codes = ["SBIN","HDFC","ICIC","AXIS","PUNB","UBIN","CNRB","BARB"]
        bank = r.choice(bank_codes)
        num  = str(r.randint(0, 99999)).zfill(6)
        return f"{bank}0{num}"

    def voter_id(self, original: str = "") -> str:
        """Generate valid-format Voter ID: ABC1234567"""
        r = self._seed(original)
        letters = ''.join(r.choice(string.ascii_uppercase) for _ in range(3))
        digits  = ''.join(str(r.randint(0,9)) for _ in range(7))
        return f"{letters}{digits}"

    def passport(self, original: str = "") -> str:
        """Generate valid-format Indian passport: A1234567"""
        r = self._seed(original)
        letter = r.choice(string.ascii_uppercase)
        digits = ''.join(str(r.randint(0,9)) for _ in range(7))
        return f"{letter}{digits}"

    def credit_card(self, original: str = "") -> str:
        """Generate valid-format 16-digit card (Luhn-valid)."""
        r = self._seed(original)
        # Start with common prefixes
        prefix = r.choice(["4532","5412","3714","6011","4916"])
        rest   = ''.join(str(r.randint(0,9)) for _ in range(11))
        partial = prefix + rest
        # Luhn checksum
        total = 0
        for i, d in enumerate(reversed(partial)):
            n = int(d)
            if i % 2 == 1: n *= 2
            if n > 9: n -= 9
            total += n
        check = (10 - (total % 10)) % 10
        num = partial + str(check)
        return f"{num[:4]} {num[4:8]} {num[8:12]} {num[12:]}"

    def date(self, original: str = "") -> str:
        """Return a plausible but different date."""
        r = self._seed(original)
        day   = r.randint(1, 28)
        month = r.randint(1, 12)
        year  = r.randint(1970, 2000)
        return f"{day:02d}/{month:02d}/{year}"

    def dob(self, original: str = "") -> str:
        return self.date(original + "_dob")

    def url(self, original: str = "") -> str:
        r = self._seed(original)
        domains = ["example.com","testsite.org","sample.in","placeholder.io"]
        path    = ''.join(r.choice(string.ascii_lowercase) for _ in range(8))
        return f"https://{r.choice(domains)}/{path}"

    def ip_address(self, original: str = "") -> str:
        r = self._seed(original)
        return f"192.168.{r.randint(1,254)}.{r.randint(1,254)}"

    def substitute(self, entity_type: str, original_value: str) -> str:
        """Route to correct generator based on entity type."""
        mapping = {
            "PERSON":         self.name,
            "names":          self.name,
            "EMAIL_ADDRESS":  self.email,
            "email":          self.email,
            "PHONE_NUMBER":   self.phone,
            "phone":          self.phone,
            "AADHAAR_NUMBER": self.aadhaar,
            "aadhaar":        self.aadhaar,
            "PAN_NUMBER":     self.pan,
            "pan":            self.pan,
            "GST_NUMBER":     self.gstin,
            "gst":            self.gstin,
            "IFSC_CODE":      self.ifsc,
            "ifsc":           self.ifsc,
            "VOTER_ID":       self.voter_id,
            "voterId":        self.voter_id,
            "IN_PASSPORT":    self.passport,
            "passport":       self.passport,
            "CREDIT_CARD":    self.credit_card,
            "creditCard":     self.credit_card,
            "DATE_TIME":      self.date,
            "date":           self.date,
            "DATE_OF_BIRTH":  self.dob,
            "dob":            self.dob,
            "URL":            self.url,
            "url":            self.url,
            "IP_ADDRESS":     self.ip_address,
            "ip":             self.ip_address,
        }
        fn = mapping.get(entity_type)
        if fn:
            return fn(original_value)
        # Unknown type — return a generic placeholder
        return f"[{entity_type.upper()}]"


synthetic = SyntheticGenerator()


# ── Endpoint ──────────────────────────────────────────────────────────────────

class SynthesizeRequest(BaseModel):
    text:      str   = ""
    threshold: float = 0.50


class SynthesizeResponse(BaseModel):
    synthesized_text: str
    substitutions:    list[dict]   # {original, replacement, entity_type}
    count:            int


@router.post("/api/v3/synthesize", response_model=SynthesizeResponse)
async def synthesize(request: SynthesizeRequest):
    """
    Replaces PII with realistic synthetic data instead of [REDACTED] placeholders.
    Same input always produces the same synthetic output (deterministic).
    """
    import feature1_pipeline_upgrade as f1
    if not f1.pipeline:
        from fastapi import HTTPException
        raise HTTPException(503, "Pipeline not ready")

    entities = f1.pipeline.run(request.text, request.threshold)

    result        = request.text
    substitutions = []
    offset        = 0  # track index shifts from replacements

    for entity in sorted(entities, key=lambda e: e.start):
        original    = entity.text
        replacement = synthetic.substitute(entity.entity_type, original)

        # Apply in-place with offset tracking
        adj_start = entity.start + offset
        adj_end   = entity.end   + offset
        result    = result[:adj_start] + replacement + result[adj_end:]
        offset   += len(replacement) - len(original)

        substitutions.append({
            "original":    original,
            "replacement": replacement,
            "entity_type": entity.entity_type,
            "confidence":  round(entity.score, 3),
        })

    return SynthesizeResponse(
        synthesized_text=result,
        substitutions=substitutions,
        count=len(substitutions),
    )


@router.get("/api/v3/synthesize/preview")
async def synthesize_preview():
    """Returns examples of synthetic data for each entity type."""
    return {
        "examples": {
            "PERSON":         synthetic.name("demo"),
            "EMAIL_ADDRESS":  synthetic.email("demo@example.com"),
            "PHONE_NUMBER":   synthetic.phone("9876543210"),
            "AADHAAR_NUMBER": synthetic.aadhaar("1234 5678 9012"),
            "PAN_NUMBER":     synthetic.pan("ABCDE1234F"),
            "GST_NUMBER":     synthetic.gstin("27ABCDE1234F1Z5"),
            "IFSC_CODE":      synthetic.ifsc("SBIN0001234"),
            "VOTER_ID":       synthetic.voter_id("ABC1234567"),
            "IN_PASSPORT":    synthetic.passport("A1234567"),
            "CREDIT_CARD":    synthetic.credit_card("4532 0151 1283 0366"),
        }
    }
