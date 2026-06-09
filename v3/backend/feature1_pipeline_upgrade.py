"""
Ciphera V3.2 — Feature 1: Detection Pipeline v3.6
===================================================
Changes over v3.5:
  - PIN_CODE pattern added (6-digit Indian postal codes with context guard)
  - UPI_ID false positive fix: stricter pattern, rejects emails more reliably
  - BANK_ACCOUNT context window widened to 80 chars
  - Vehicle reg pattern tightened to avoid matching serial numbers
  - DOB regex: added DD.MM.YYYY dot-separated variant
  - Context boost added for PIN_CODE (postal, pincode, zip keywords)
  - TYPE_FLOOR updated with PIN_CODE entry
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import spacy
from pydantic import BaseModel, Field
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ciphera.pipeline")

# ── Constants ──────────────────────────────────────────────────────────────────

SUPPRESSION_LIST: set[str] = {
    "aadhaar","aadhar","pan","ifsc","gst","gstin","passport","voter","voterid",
    "email","phone","mobile","address","dob","name","uid","uidai",
    "date","year","month","day","time","number","ref","id","total","amount",
}

SPACY_IGNORE_LABELS: set[str] = {
    "CARDINAL","ORDINAL","QUANTITY","PERCENT","MONEY",
    "WORK_OF_ART","LAW","LANGUAGE","EVENT","PRODUCT",
}

REGEX_TYPE_LOCK_THRESHOLD = 0.80
CONFIDENCE_THRESHOLD      = 0.50

SOURCE_WEIGHTS = {"regex": 1.4, "presidio": 1.0, "spacy": 0.9}

TYPE_FLOOR: dict[str, float] = {
    "PERSON":           0.52,
    "LOCATION":         0.58,
    "ORGANIZATION":     0.62,
    "DATE_TIME":        0.58,
    "DATE_OF_BIRTH":    0.65,
    "AADHAAR_NUMBER":   0.60,
    "PAN_NUMBER":       0.70,
    "PHONE_NUMBER":     0.65,
    "EMAIL_ADDRESS":    0.70,
    "GST_NUMBER":       0.70,
    "IFSC_CODE":        0.70,
    "UPI_ID":           0.80,
    "BANK_ACCOUNT":     0.65,
    "DRIVING_LICENCE":  0.68,
    "PIN_CODE":         0.72,   # NEW
}

# ── Verhoeff ──────────────────────────────────────────────────────────────────
_D=[[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]]
_P=[[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]

def _verhoeff(n: str) -> bool:
    c = 0
    for i, d in enumerate(reversed(n)):
        c = _D[c][_P[i % 8][int(d)]]
    return c == 0

# ── OCR Cleaner ───────────────────────────────────────────────────────────────
class OCRCleaner:
    SUBS = [
        (re.compile(r'\b0(?=[A-Z])'),   'O'),
        (re.compile(r'(?<=[A-Z])0\b'),  'O'),
        (re.compile(r'\bl(?=\d)'),      '1'),
        (re.compile(r'(?<=\d)l\b'),     '1'),
        (re.compile(r'[''`]'),          "'"),
        (re.compile(r'[""„]'),          '"'),
        (re.compile(r'\r\n|\r'),        '\n'),
        (re.compile(r'[ \t]{2,}'),      ' '),
    ]
    def clean(self, text: str) -> str:
        for p, r in self.SUBS:
            text = p.sub(r, text)
        return text.strip()

ocr_cleaner = OCRCleaner()

# ── Data models ───────────────────────────────────────────────────────────────
class DetectionSource(str, Enum):
    REGEX   = "regex"
    PRESIDIO= "presidio"
    SPACY   = "spacy"
    MERGED  = "merged"

@dataclass
class DetectedEntity:
    start: int; end: int; entity_type: str; text: str; score: float
    source: DetectionSource; context: str = ""; merged_from: list[DetectionSource] = field(default_factory=list)
    type_locked: bool = False

    def to_dict(self) -> dict:
        return {
            "start": self.start, "end": self.end,
            "entity_type": self.entity_type, "text": self.text,
            "score": round(self.score, 4), "source": self.source.value,
            "context": self.context,
            "merged_from": [s.value for s in self.merged_from],
        }

# ── Regex Stage ───────────────────────────────────────────────────────────────
_MONTHS = (
    r"(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
)

_DOB_PATTERNS = [
    # DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    r"\b(?:0?[1-9]|[12]\d|3[01])[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.](?:19|20)\d{2}\b",
    # YYYY-MM-DD ISO
    r"\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b",
    # DD Month YYYY
    rf"\b(?:0?[1-9]|[12]\d|3[01])\s+{_MONTHS}\s+(?:19|20)\d{{2}}\b",
    # Month DD, YYYY
    rf"\b{_MONTHS}\s+(?:0?[1-9]|[12]\d|3[01]),?\s+(?:19|20)\d{{2}}\b",
]
_DOB_RE      = re.compile("|".join(f"(?:{p})" for p in _DOB_PATTERNS), re.IGNORECASE)
_VERSION_RE  = re.compile(r"\d+\.\d+\.\d+")

# UPI: handle@bank — bank is 2-64 alpha chars, handle must NOT look like email
# (email has dots in domain like .com / .in — UPI bank handles don't)
_UPI_RE = re.compile(
    r"\b([a-zA-Z0-9.\-_]{2,64})@([a-zA-Z]{2,20})\b"
)
# Banks/UPI handles — common Indian VPA suffixes (not TLDs)
_UPI_VALID_HANDLES = {
    "okaxis","okicici","oksbi","okhdfcbank","ybl","upi","apl","axl",
    "axisbank","hdfcbank","icici","sbi","kotak","paytm","gpay","ibl",
    "indus","pnb","bob","boi","cnrb","federal","kvb","rbl","aubank",
    "axisb","waaxis","waicici","wasbi","mahb","barodampay","centralbank",
    "dbs","equitas","idbi","idfc","idfcfirst","indianbank","jkb","jkubank",
    "kbl","lvb","nsdl","obc","scb","syndicate","tmb","ubi","ucb","ucobank",
    "unionbank","vijayabank","yapl","yesbank","allbank","andb","vijb",
    "cbin","dlb","esaf","fbl","hcbl","hsbc","icicibankltd","kccb","mab",
}
_EMAIL_TLD = re.compile(r"\.(com|in|org|net|io|co|gov|edu|info|biz|me|app)$", re.I)


class RegexStage:
    # UPI handled separately — see analyze()
    PATTERNS = [
        # Aadhaar
        (r"\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b",        "AADHAAR_NUMBER",   0.85),
        # PAN
        (r"\b([A-Z]{5}[0-9]{4}[A-Z])\b",                 "PAN_NUMBER",       0.95),
        # GST
        (r"\b\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", "GST_NUMBER",  0.93),
        # IFSC
        (r"\b([A-Z]{4}0[A-Z0-9]{6})\b",                  "IFSC_CODE",        0.92),
        # Voter ID
        (r"\b([A-Z]{3}[0-9]{7})\b",                      "VOTER_ID",         0.78),
        # Passport
        (r"\b([A-PR-WY][1-9]\d{7})\b",                   "IN_PASSPORT",      0.75),
        # Phone
        (r"(\+91[\s\-]?|0)?[6-9]\d{4}[\s\-]?\d{5}\b",   "PHONE_NUMBER",     0.85),
        (r"\b([6-9]\d{9})\b",                             "PHONE_NUMBER",     0.80),
        # Email (before UPI so it takes priority)
        (r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b", "EMAIL_ADDRESS", 0.98),
        # Bank account — 9-18 digits, context-gated (see analyze())
        (r"\b\d{9,18}\b",                                 "BANK_ACCOUNT",     0.60),
        # Indian Driving Licence — StateCode YY NNNNNNNN (13 or 15 chars)
        (r"\b[A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{7}\b", "DRIVING_LICENCE", 0.78),
        # Vehicle reg — tightened: must have letter block between numbers
        (r"\b[A-Z]{2}[\s\-]?\d{1,2}[\s\-][A-Z]{1,3}[\s\-]\d{4}\b", "IN_VEHICLE_REG", 0.74),
        # IPv4
        (r"\b(?:\d{1,3}\.){3}\d{1,3}\b",                 "IP_ADDRESS",       0.82),
        # URL
        (r"https?://[^\s\"'<>]+",                         "URL",              0.90),
        # Credit card
        (r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b",
                                                          "CREDIT_CARD",      0.88),
        # PIN Code — 6-digit Indian postal, context-gated (see analyze())
        (r"\b([1-9]\d{5})\b",                             "PIN_CODE",         0.68),
    ]

    # Context keywords for context-gated patterns
    _BANK_CTX_KW   = {"account","a/c","acc","bank","savings","current","neft","rtgs","imps"}
    _PIN_CTX_KW    = {"pin","pincode","postal","zip","post","पिन","पिन कोड"}
    # Context window in chars
    _CTX_WINDOW    = 80

    def __init__(self):
        self._compiled = [(re.compile(p), et, sc) for p, et, sc in self.PATTERNS]

    def analyze(self, text: str) -> list[DetectedEntity]:
        results: list[DetectedEntity] = []

        # ── UPI IDs — handled separately with strict validation ───────────────
        # We iterate UPI matches before everything else so EMAIL_ADDRESS can
        # take priority (email regex fires first in loop below).
        # Logic: match handle@issuer where issuer is a known UPI bank handle
        # OR issuer is pure alpha and NOT a common TLD.
        for m in _UPI_RE.finditer(text):
            raw     = m.group()
            handle  = m.group(1)
            issuer  = m.group(2).lower()
            # Skip if it's obviously an email domain (has a dot or is a TLD)
            if _EMAIL_TLD.match(f".{issuer}"):
                continue
            # Must be known UPI handle OR issuer is all-alpha ≤ 10 chars (VPA)
            is_known = issuer in _UPI_VALID_HANDLES
            is_vpa   = re.match(r'^[a-z]{2,10}$', issuer) and len(issuer) <= 10
            if not (is_known or is_vpa):
                continue
            # Check context for UPI keywords to boost confidence
            ctx    = _get_context(text, m.start(), m.end(), self._CTX_WINDOW).lower()
            has_ctx = any(kw in ctx for kw in [
                "upi","payment","pay","transfer","gpay","phonepe","paytm","bhim","send","receive",
            ])
            score = 0.88 if is_known else (0.78 if has_ctx else 0.72)
            results.append(DetectedEntity(
                start=m.start(), end=m.end(),
                entity_type="UPI_ID", text=raw,
                score=score, source=DetectionSource.REGEX,
                context=_get_context(text, m.start(), m.end()),
                type_locked=(score >= REGEX_TYPE_LOCK_THRESHOLD),
            ))

        # ── All other patterns ────────────────────────────────────────────────
        for pattern, entity_type, base_score in self._compiled:
            for m in pattern.finditer(text):
                raw = m.group()
                if raw.strip().lower() in SUPPRESSION_LIST:
                    continue

                # Skip UPI_ID here — handled above
                if entity_type == "UPI_ID":
                    continue

                # Bank account: require banking context within 80 chars
                if entity_type == "BANK_ACCOUNT":
                    ctx = _get_context(text, m.start(), m.end(), self._CTX_WINDOW).lower()
                    if not any(kw in ctx for kw in self._BANK_CTX_KW):
                        continue

                # PIN Code: require postal context within 80 chars
                if entity_type == "PIN_CODE":
                    ctx = _get_context(text, m.start(), m.end(), self._CTX_WINDOW).lower()
                    if not any(kw in ctx for kw in self._PIN_CTX_KW):
                        continue
                    # Reject if it overlaps a phone number pattern
                    if re.match(r'^[6-9]\d{5}$', raw):
                        continue

                score = self._validate(raw, entity_type, base_score)
                if score == 0:
                    continue

                results.append(DetectedEntity(
                    start=m.start(), end=m.end(),
                    entity_type=entity_type, text=raw,
                    score=score, source=DetectionSource.REGEX,
                    context=_get_context(text, m.start(), m.end()),
                    type_locked=(score >= REGEX_TYPE_LOCK_THRESHOLD),
                ))

        # ── DOB ───────────────────────────────────────────────────────────────
        for m in _DOB_RE.finditer(text):
            raw = m.group().strip()
            if not raw:
                continue
            if _VERSION_RE.match(raw):
                continue
            results.append(DetectedEntity(
                start=m.start(), end=m.end(),
                entity_type="DATE_OF_BIRTH", text=raw,
                score=0.82, source=DetectionSource.REGEX,
                context=_get_context(text, m.start(), m.end()),
                type_locked=True,
            ))

        return results

    @staticmethod
    def _validate(value: str, entity_type: str, base_score: float) -> float:
        if entity_type == "AADHAAR_NUMBER":
            digits = re.sub(r"\D", "", value)
            if len(digits) != 12: return 0
            if digits[0] in "01":  return 0
            if len(set(digits)) <= 3: return 0
            return base_score if _verhoeff(digits) else base_score * 0.72

        if entity_type == "IP_ADDRESS":
            parts = value.split(".")
            try:
                if not all(0 <= int(p) <= 255 for p in parts): return 0
            except ValueError:
                return 0
            if parts[0] in ("127", "10") or (parts[0] == "192" and parts[1] == "168"):
                return base_score * 0.5

        if entity_type == "CREDIT_CARD":
            digits = re.sub(r"\D", "", value)
            s = 0
            for i, d in enumerate(reversed(digits)):
                n = int(d)
                if i % 2 == 1: n *= 2
                if n > 9: n -= 9
                s += n
            return base_score if s % 10 == 0 else 0

        if entity_type == "PIN_CODE":
            # Reject obviously invalid pin codes
            first_two = int(value[:2])
            if first_two < 11 or first_two > 99: return 0

        return base_score


# ── Presidio Stage ────────────────────────────────────────────────────────────
class PresidioStage:
    TARGET_ENTITIES = [
        "PERSON", "LOCATION", "ORGANIZATION",
        "PHONE_NUMBER", "EMAIL_ADDRESS", "CREDIT_CARD", "DATE_TIME", "NRP",
    ]

    def __init__(self, nlp_model_name: str):
        provider = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": nlp_model_name}],
        })
        self.analyzer = AnalyzerEngine(
            nlp_engine=provider.create_engine(),
            supported_languages=["en"],
        )
        self._add_custom()
        logger.info("Presidio: %d recognizers", len(self.analyzer.registry.recognizers))

    def _add_custom(self):
        for rec in [
            PatternRecognizer("AADHAAR_NUMBER", patterns=[
                Pattern("AADHAAR_SPACED",  r"\b\d{4}[\s\-]\d{4}[\s\-]\d{4}\b", 0.85),
                Pattern("AADHAAR_COMPACT", r"\b[2-9]\d{11}\b",                  0.55),
            ], context=["aadhaar", "uid", "uidai"]),
            PatternRecognizer("PAN_NUMBER", patterns=[
                Pattern("PAN", r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", 0.95),
            ], context=["pan", "permanent account", "income tax"]),
            PatternRecognizer("GST_NUMBER", patterns=[
                Pattern("GST", r"\b\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", 0.93),
            ], context=["gst", "gstin", "invoice"]),
            PatternRecognizer("IFSC_CODE", patterns=[
                Pattern("IFSC", r"\b[A-Z]{4}0[A-Z0-9]{6}\b", 0.90),
            ], context=["ifsc", "bank", "neft", "rtgs"]),
            PatternRecognizer("UPI_ID", patterns=[
                Pattern("UPI", r"\b[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,20}\b", 0.80),
            ], context=["upi", "payment", "gpay", "phonepe", "paytm", "bhim"]),
            PatternRecognizer("PIN_CODE", patterns=[
                Pattern("PIN", r"\b[1-9]\d{5}\b", 0.65),
            ], context=["pin", "pincode", "postal", "zip", "post"]),
        ]:
            self.analyzer.registry.add_recognizer(rec)

    def analyze(self, text: str) -> list[DetectedEntity]:
        results = []
        for r in self.analyzer.analyze(
            text=text, entities=self.TARGET_ENTITIES, language="en"
        ):
            span = text[r.start:r.end]
            if span.strip().lower() in SUPPRESSION_LIST:
                continue
            results.append(DetectedEntity(
                start=r.start, end=r.end, entity_type=r.entity_type,
                text=span, score=r.score, source=DetectionSource.PRESIDIO,
                context=_get_context(text, r.start, r.end),
            ))
        return results


# ── spaCy Stage ───────────────────────────────────────────────────────────────
class SpacyNERStage:
    LABEL_MAP = {
        "PERSON": "PERSON", "ORG": "ORGANIZATION",
        "GPE": "LOCATION",  "LOC": "LOCATION",
        "FAC": "LOCATION",  "DATE": "DATE_TIME", "TIME": "DATE_TIME",
    }

    def __init__(self, nlp: spacy.Language):
        self.nlp = nlp

    def analyze(self, text: str) -> list[DetectedEntity]:
        results = []
        doc = self.nlp(text)
        for ent in doc.ents:
            if ent.label_ in SPACY_IGNORE_LABELS:
                continue
            mapped = self.LABEL_MAP.get(ent.label_)
            if not mapped:
                continue
            if ent.text.strip().lower() in SUPPRESSION_LIST:
                continue
            if mapped == "DATE_TIME" and re.match(r"^\d{10}$", ent.text.strip()):
                continue
            score = 0.72
            ctx = _get_context(text, ent.start_char, ent.end_char, 40).lower()
            if mapped == "PERSON" and any(
                t in ctx for t in ["mr", "mrs", "ms", "dr", "shri", "smt", "kumari", "sh.", "smt."]
            ):
                score = 0.82
            results.append(DetectedEntity(
                start=ent.start_char, end=ent.end_char,
                entity_type=mapped, text=ent.text,
                score=score, source=DetectionSource.SPACY,
                context=_get_context(text, ent.start_char, ent.end_char),
            ))
        return results


# ── Context scoring ───────────────────────────────────────────────────────────
CONTEXT_BOOSTS = [
    ("AADHAAR_NUMBER",  ["aadhaar","uid","uidai","aadhar"],               +0.12),
    ("PAN_NUMBER",      ["pan","permanent account","income tax"],          +0.12),
    ("DATE_OF_BIRTH",   ["dob","born","birth","date of birth","d.o.b","जन्म"],+0.10),
    ("PERSON",          ["mr","mrs","ms","dr","shri","smt","name","applicant","candidate"],+0.10),
    ("PHONE_NUMBER",    ["phone","mobile","cell","contact","tel","mob"],    +0.10),
    ("EMAIL_ADDRESS",   ["email","mail","e-mail"],                         +0.05),
    ("GST_NUMBER",      ["gst","gstin","invoice","tax"],                   +0.10),
    ("IFSC_CODE",       ["ifsc","bank","neft","rtgs"],                     +0.10),
    ("UPI_ID",          ["upi","payment","gpay","phonepe","paytm","bhim","transfer"],+0.12),
    ("BANK_ACCOUNT",    ["account","a/c","acc","savings","current","bank"],+0.12),
    ("DRIVING_LICENCE", ["licence","license","dl","driving"],              +0.12),
    ("PIN_CODE",        ["pin","pincode","postal","zip","post","पिन"],     +0.12),
]

CONTEXT_SUPPRESSION = [
    ("PERSON",          ["order","invoice","ref","id","number","product","item","section"],-0.15),
    ("AADHAAR_NUMBER",  ["order","invoice","ref","tracking","ticket","version"],          -0.20),
    ("DATE_TIME",       ["phone","mobile","contact","tel"],                               -0.60),
    ("ORGANIZATION",    ["aadhaar","pan","gst","ifsc","uid"],                             -0.40),
    ("LOCATION",        ["pan","ifsc","gst"],                                             -0.35),
    ("DATE_OF_BIRTH",   ["version","v.","release","patch"],                               -0.90),
    ("PIN_CODE",        ["version","v.","release","patch","otp","code"],                  -0.40),
]

def apply_context_scoring(
    entities: list[DetectedEntity], text: str
) -> list[DetectedEntity]:
    for entity in entities:
        ctx = _get_context(text, entity.start, entity.end, 60).lower()
        for etype, keywords, boost in CONTEXT_BOOSTS:
            if entity.entity_type == etype and any(kw in ctx for kw in keywords):
                entity.score = min(1.0, entity.score + boost)
        for etype, keywords, penalty in CONTEXT_SUPPRESSION:
            if entity.entity_type == etype and any(kw in ctx for kw in keywords):
                entity.score = max(0.0, entity.score + penalty)
    return entities


# ── Voting + merge ────────────────────────────────────────────────────────────
def merge_and_vote(candidates: list[DetectedEntity]) -> list[DetectedEntity]:
    if not candidates:
        return []

    candidates.sort(key=lambda e: (e.start, -e.score))
    groups: list[list[DetectedEntity]] = []
    cur = [candidates[0]]
    end = candidates[0].end

    for entity in candidates[1:]:
        if entity.start < end:
            cur.append(entity)
            end = max(end, entity.end)
        else:
            groups.append(cur)
            cur = [entity]
            end = entity.end
    groups.append(cur)

    merged = []
    for group in groups:
        locked = [e for e in group if e.type_locked]
        if locked:
            elected_type = max(locked, key=lambda e: e.score).entity_type
        else:
            tw: dict[str, float] = {}
            for e in group:
                w = SOURCE_WEIGHTS.get(e.source.value, 1.0)
                tw[e.entity_type] = tw.get(e.entity_type, 0.0) + e.score * w
            elected_type = max(tw, key=tw.__getitem__)

        total_w = sum(SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group)
        wscore  = sum(
            e.score * SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group
        ) / total_w

        if wscore < CONFIDENCE_THRESHOLD:
            continue
        floor = TYPE_FLOOR.get(elected_type, CONFIDENCE_THRESHOLD)
        if wscore < floor:
            continue

        best    = max(group, key=lambda e: e.score * SOURCE_WEIGHTS.get(e.source.value, 1.0))
        sources = list({e.source for e in group})
        merged.append(DetectedEntity(
            start=best.start, end=best.end,
            entity_type=elected_type, text=best.text,
            score=min(wscore, 1.0),
            source=DetectionSource.MERGED if len(sources) > 1 else sources[0],
            context=best.context, merged_from=sources,
        ))
    return merged


# ── Pipeline ──────────────────────────────────────────────────────────────────
class DetectionPipeline:
    def __init__(self, use_transformer: bool = True):
        model = "en_core_web_trf" if use_transformer else "en_core_web_lg"
        logger.info("Loading spaCy model %s …", model)
        try:
            nlp = spacy.load(model)
        except OSError:
            logger.warning("%s not found, falling back to en_core_web_lg", model)
            try:
                nlp   = spacy.load("en_core_web_lg")
                model = "en_core_web_lg"
            except OSError:
                logger.warning("en_core_web_lg not found, falling back to en_core_web_sm")
                nlp   = spacy.load("en_core_web_sm")
                model = "en_core_web_sm"

        disabled = [p for p in ["parser", "attribute_ruler", "lemmatizer"]
                    if p in nlp.pipe_names]
        if disabled:
            nlp.disable_pipes(*disabled)

        self.regex_stage    = RegexStage()
        self.presidio_stage = PresidioStage(model)
        self.spacy_stage    = SpacyNERStage(nlp)
        logger.info("DetectionPipeline v3.6 ready (model=%s).", model)

    def run(
        self,
        text: str,
        threshold: float = CONFIDENCE_THRESHOLD,
        enabled_stages: Optional[list[str]] = None,
        clean_ocr: bool = False,
    ) -> list[DetectedEntity]:
        stages = enabled_stages or ["regex", "presidio", "spacy"]
        if clean_ocr:
            text = ocr_cleaner.clean(text)

        all_candidates: list[DetectedEntity] = []
        if "regex"    in stages: all_candidates.extend(self.regex_stage.analyze(text))
        if "presidio" in stages: all_candidates.extend(self.presidio_stage.analyze(text))
        if "spacy"    in stages: all_candidates.extend(self.spacy_stage.analyze(text))

        all_candidates = apply_context_scoring(all_candidates, text)
        merged = merge_and_vote(all_candidates)
        result = sorted(
            [e for e in merged if e.score >= threshold],
            key=lambda e: e.start,
        )
        logger.info("Pipeline v3.6: %d raw → %d entities", len(all_candidates), len(result))
        return result


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_context(text: str, start: int, end: int, window: int = 40) -> str:
    return text[max(0, start - window): min(len(text), end + window)]


# ── FastAPI models (imported by main.py) ─────────────────────────────────────
class AnalyzeRequest(BaseModel):
    text:            str             = Field(..., min_length=1, max_length=500_000)
    threshold:       float           = Field(0.50, ge=0.0, le=1.0)
    enabled_stages:  list[str] | None = Field(None)
    include_context: bool            = Field(True)
    clean_ocr:       bool            = Field(False)

class EntityResponse(BaseModel):
    start: int; end: int; entity_type: str; text: str
    score: float; source: str; context: str; merged_from: list[str]

class AnalyzeResponse(BaseModel):
    entity_count: int; entities: list[EntityResponse]; stats: dict

pipeline: Optional[DetectionPipeline] = None