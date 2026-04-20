"""
Ciphera V3 — Feature 1: Accuracy Upgrade
==========================================
Changes over previous pipeline:
  - en_core_web_lg  →  en_core_web_trf  (RoBERTa transformer, much better NER)
  - Expanded DOB regex: handles DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
    D Month YYYY, Month D YYYY, YYYY-MM-DD (ISO), written forms
  - Tighter false-positive suppression for CARDINAL / MONEY / QUANTITY
  - Per-entity confidence floor (entities below type-specific minimum dropped)
  - OCR pre-processing layer (common Tesseract substitution fixes)

Install BEFORE running:
    pip install spacy torch
    python -m spacy download en_core_web_trf

Replace your existing ciphera_v3_pipeline.py with this file entirely.
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from contextlib import asynccontextmanager

import spacy
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ciphera.pipeline")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPRESSION_LIST: set[str] = {
    "aadhaar", "aadhar", "pan", "ifsc", "gst", "gstin",
    "passport", "voter", "voterid", "email", "phone",
    "mobile", "address", "dob", "name", "uid", "uidai",
    "date", "year", "month", "day", "time",
}

# spaCy labels to completely ignore (never emit these)
SPACY_IGNORE_LABELS: set[str] = {
    "CARDINAL", "ORDINAL", "QUANTITY", "PERCENT",
    "MONEY", "WORK_OF_ART", "LAW", "LANGUAGE", "EVENT",
}

PHONE_PATTERN_10D = re.compile(r"^\d{5}\s\d{5}$|^\d{10}$")
REGEX_TYPE_LOCK_THRESHOLD = 0.80
CONFIDENCE_THRESHOLD = 0.50

SOURCE_WEIGHTS = {
    "regex":    1.4,
    "presidio": 1.0,
    "spacy":    0.9,
}

# Per-type minimum score — entities below this are dropped even if above global threshold
TYPE_FLOOR: dict[str, float] = {
    "PERSON":         0.55,
    "LOCATION":       0.60,
    "ORGANIZATION":   0.65,
    "DATE_TIME":      0.60,
    "AADHAAR_NUMBER": 0.60,
    "PAN_NUMBER":     0.70,
    "PHONE_NUMBER":   0.65,
    "EMAIL_ADDRESS":  0.70,
    "GST_NUMBER":     0.70,
    "IFSC_CODE":      0.70,
}


# ---------------------------------------------------------------------------
# OCR Pre-processor
# ---------------------------------------------------------------------------

class OCRCleaner:
    """
    Fixes common Tesseract OCR substitution errors before NLP processing.
    Runs in <1ms on typical documents.
    """

    # (bad_pattern, replacement)
    SUBSTITUTIONS = [
        (re.compile(r'\b0(?=[A-Z])'),          'O'),   # 0BAMA → OBAMA
        (re.compile(r'(?<=[A-Z])0\b'),          'O'),   # HELL0 → HELLO
        (re.compile(r'\bl(?=\d)'),              '1'),   # l23 → 123
        (re.compile(r'(?<=\d)l\b'),             '1'),   # 23l → 231
        (re.compile(r'\bS(?=\d{3})'),           '5'),   # S234 → 5234 (common in IDs)
        (re.compile(r'(?<=\d)S\b'),             '5'),
        (re.compile(r'\bI(?=\d)'),              '1'),   # I23 → 123
        (re.compile(r'[''`]'),                  "'"),   # smart quotes
        (re.compile(r'[""„]'),                  '"'),
        (re.compile(r'\r\n|\r'),                '\n'),  # normalize line endings
        (re.compile(r'[ \t]{2,}'),              ' '),   # collapse spaces
    ]

    def clean(self, text: str) -> str:
        for pattern, replacement in self.SUBSTITUTIONS:
            text = pattern.sub(replacement, text)
        return text.strip()


ocr_cleaner = OCRCleaner()


# ---------------------------------------------------------------------------
# Verhoeff checksum (Aadhaar)
# ---------------------------------------------------------------------------

_D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
      [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
      [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
      [9,8,7,6,5,4,3,2,1,0]]
_P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
      [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
      [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]

def _verhoeff_validate(n: str) -> bool:
    c = 0
    for i, d in enumerate(reversed(n)):
        c = _D[c][_P[i % 8][int(d)]]
    return c == 0


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class DetectionSource(str, Enum):
    REGEX    = "regex"
    PRESIDIO = "presidio"
    SPACY    = "spacy"
    MERGED   = "merged"


@dataclass
class DetectedEntity:
    start:        int
    end:          int
    entity_type:  str
    text:         str
    score:        float
    source:       DetectionSource
    context:      str = ""
    merged_from:  list[DetectionSource] = field(default_factory=list)
    type_locked:  bool = False

    def to_dict(self) -> dict:
        return {
            "start":       self.start,
            "end":         self.end,
            "entity_type": self.entity_type,
            "text":        self.text,
            "score":       round(self.score, 4),
            "source":      self.source.value,
            "context":     self.context,
            "merged_from": [s.value for s in self.merged_from],
        }


# ---------------------------------------------------------------------------
# Stage 1 — Regex (upgraded with comprehensive DOB patterns)
# ---------------------------------------------------------------------------

# Month names for DOB regex
_MONTHS = (
    r"(?:January|February|March|April|May|June|July|August|September|"
    r"October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
)

_DOB_PATTERNS = [
    # DD/MM/YYYY  DD-MM-YYYY  DD.MM.YYYY  DD\MM\YYYY
    r"\b\d{1,2}[\/\-\.\\ ]\d{1,2}[\/\-\.\\ ]\d{2,4}\b",
    # YYYY-MM-DD (ISO 8601)
    r"\b\d{4}-\d{2}-\d{2}\b",
    # DD Month YYYY  or  Month DD YYYY  or  Month DD, YYYY
    rf"\b\d{{1,2}}\s+{_MONTHS}\s+\d{{2,4}}\b",
    rf"\b{_MONTHS}\s+\d{{1,2}},?\s+\d{{2,4}}\b",
    # Written: "born on the 5th of March 1995"
    r"\b\d{1,2}(?:st|nd|rd|th)\s+of\s+" + _MONTHS + r"\s+\d{4}\b",
    # DD MM YYYY (space separated)
    r"\b\d{2}\s\d{2}\s\d{4}\b",
]

_DOB_COMBINED = re.compile(
    "|".join(f"(?:{p})" for p in _DOB_PATTERNS),
    re.IGNORECASE,
)


class RegexStage:
    PATTERNS: list[tuple[str, str, float]] = [
        # Aadhaar
        (r"\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b",               "AADHAAR_NUMBER",  0.85),
        # PAN
        (r"\b([A-Z]{5}[0-9]{4}[A-Z])\b",                        "PAN_NUMBER",      0.95),
        # GST
        (r"\b\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b",  "GST_NUMBER",      0.93),
        # IFSC
        (r"\b([A-Z]{4}0[A-Z0-9]{6})\b",                         "IFSC_CODE",       0.92),
        # Voter ID
        (r"\b([A-Z]{3}[0-9]{7})\b",                             "VOTER_ID",        0.78),
        # Indian Passport
        (r"\b([A-PR-WY][1-9]\d{7})\b",                          "IN_PASSPORT",     0.75),
        # Indian mobile (+91 prefix or bare 10-digit)
        (r"(\+91[\s\-]?|0)?[6-9]\d{4}[\s\-]?\d{5}\b",          "PHONE_NUMBER",    0.85),
        (r"\b([6-9]\d{9})\b",                                    "PHONE_NUMBER",    0.80),
        # Email
        (r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
                                                                  "EMAIL_ADDRESS",   0.98),
        # Vehicle reg
        (r"\b[A-Z]{2}[\s\-]?[0-9]{1,2}[\s\-]?[A-Z]{1,3}[\s\-]?[0-9]{4}\b",
                                                                  "IN_VEHICLE_REG",  0.72),
        # IPv4
        (r"\b(?:\d{1,3}\.){3}\d{1,3}\b",                        "IP_ADDRESS",      0.82),
        # URL
        (r"https?://[^\s\"'<>]+",                                "URL",             0.90),
    ]

    def __init__(self):
        self._compiled = [
            (re.compile(pat), etype, score)
            for pat, etype, score in self.PATTERNS
        ]

    def analyze(self, text: str) -> list[DetectedEntity]:
        results: list[DetectedEntity] = []

        # Standard patterns
        for pattern, entity_type, base_score in self._compiled:
            for m in pattern.finditer(text):
                raw = m.group()
                if raw.strip().lower() in SUPPRESSION_LIST:
                    continue
                score = self._validate(raw, entity_type, base_score)
                if score == 0:
                    continue
                results.append(DetectedEntity(
                    start=m.start(), end=m.end(),
                    entity_type=entity_type, text=raw, score=score,
                    source=DetectionSource.REGEX,
                    context=_get_context(text, m.start(), m.end()),
                    type_locked=(score >= REGEX_TYPE_LOCK_THRESHOLD),
                ))

        # DOB patterns (separate because combined regex)
        for m in _DOB_COMBINED.finditer(text):
            raw = m.group().strip()
            if not raw:
                continue
            results.append(DetectedEntity(
                start=m.start(), end=m.end(),
                entity_type="DATE_OF_BIRTH", text=raw, score=0.82,
                source=DetectionSource.REGEX,
                context=_get_context(text, m.start(), m.end()),
                type_locked=True,
            ))

        return results

    @staticmethod
    def _validate(value: str, entity_type: str, base_score: float) -> float:
        if entity_type == "AADHAAR_NUMBER":
            digits = re.sub(r"\D", "", value)
            if len(digits) != 12:
                return 0
            return base_score if _verhoeff_validate(digits) else base_score * 0.75

        if entity_type == "IP_ADDRESS":
            parts = value.split(".")
            try:
                if not all(0 <= int(p) <= 255 for p in parts):
                    return 0
            except ValueError:
                return 0
            if parts[0] in ("127", "10") or (parts[0] == "192" and parts[1] == "168"):
                return base_score * 0.3

        return base_score


# ---------------------------------------------------------------------------
# Stage 2 — Presidio
# ---------------------------------------------------------------------------

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
            nlp_engine=provider.create_engine(), supported_languages=["en"]
        )
        self._add_custom_recognizers()
        logger.info("Presidio: %d recognizers", len(self.analyzer.registry.recognizers))

    def _add_custom_recognizers(self):
        for rec in [
            PatternRecognizer("AADHAAR_NUMBER", patterns=[
                Pattern("AADHAAR_SPACED",  r"\b\d{4}[\s\-]\d{4}[\s\-]\d{4}\b", 0.85),
                Pattern("AADHAAR_COMPACT", r"\b\d{12}\b", 0.60),
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
        ]:
            self.analyzer.registry.add_recognizer(rec)

    def analyze(self, text: str) -> list[DetectedEntity]:
        results = []
        for r in self.analyzer.analyze(text=text, entities=self.TARGET_ENTITIES, language="en"):
            span = text[r.start:r.end]
            if span.strip().lower() in SUPPRESSION_LIST:
                continue
            results.append(DetectedEntity(
                start=r.start, end=r.end, entity_type=r.entity_type,
                text=span, score=r.score, source=DetectionSource.PRESIDIO,
                context=_get_context(text, r.start, r.end),
            ))
        return results


# ---------------------------------------------------------------------------
# Stage 3 — spaCy NER (transformer)
# ---------------------------------------------------------------------------

class SpacyNERStage:
    LABEL_MAP = {
        "PERSON":  "PERSON",
        "ORG":     "ORGANIZATION",
        "GPE":     "LOCATION",
        "LOC":     "LOCATION",
        "FAC":     "LOCATION",
        "DATE":    "DATE_TIME",
        "TIME":    "DATE_TIME",
    }

    def __init__(self, nlp: spacy.Language):
        self.nlp = nlp

    def analyze(self, text: str) -> list[DetectedEntity]:
        results = []
        for ent in self.nlp(text).ents:
            # Drop noisy labels entirely
            if ent.label_ in SPACY_IGNORE_LABELS:
                continue
            mapped = self.LABEL_MAP.get(ent.label_)
            if not mapped:
                continue
            if ent.text.strip().lower() in SUPPRESSION_LIST:
                continue
            if mapped == "DATE_TIME" and PHONE_PATTERN_10D.match(ent.text.strip()):
                continue
            results.append(DetectedEntity(
                start=ent.start_char, end=ent.end_char,
                entity_type=mapped, text=ent.text, score=0.72,
                source=DetectionSource.SPACY,
                context=_get_context(text, ent.start_char, ent.end_char),
            ))
        return results


# ---------------------------------------------------------------------------
# Context scoring
# ---------------------------------------------------------------------------

CONTEXT_BOOSTS = [
    ("AADHAAR_NUMBER",  ["aadhaar", "uid", "uidai", "aadhar"],            +0.12),
    ("PAN_NUMBER",      ["pan", "permanent account", "income tax"],        +0.12),
    ("DATE_OF_BIRTH",   ["dob", "born", "birth", "date of birth",
                          "birthdate", "d.o.b"],                           +0.10),
    ("PERSON",          ["mr", "mrs", "ms", "dr", "shri", "smt",
                          "name", "applicant", "candidate", "signed"],     +0.08),
    ("PHONE_NUMBER",    ["phone", "mobile", "cell", "contact", "tel",
                          "whatsapp"],                                      +0.10),
    ("EMAIL_ADDRESS",   ["email", "mail", "e-mail"],                       +0.05),
    ("GST_NUMBER",      ["gst", "gstin", "invoice", "tax"],                +0.10),
    ("IFSC_CODE",       ["ifsc", "bank", "neft", "rtgs"],                  +0.10),
]

CONTEXT_SUPPRESSION = [
    ("PERSON",          ["order", "invoice", "ref", "id", "number",
                          "product", "item"],                              -0.15),
    ("AADHAAR_NUMBER",  ["order", "invoice", "ref", "tracking",
                          "ticket"],                                       -0.20),
    ("DATE_TIME",       ["phone", "mobile", "contact", "tel"],            -0.60),
    ("ORGANIZATION",    ["aadhaar", "pan", "gst", "ifsc", "uid"],         -0.40),
    ("LOCATION",        ["pan", "ifsc", "gst"],                           -0.35),
]


def apply_context_scoring(
    entities: list[DetectedEntity], text: str
) -> list[DetectedEntity]:
    for entity in entities:
        ctx = _get_context(text, entity.start, entity.end, window=60).lower()
        for etype, keywords, boost in CONTEXT_BOOSTS:
            if entity.entity_type == etype and any(kw in ctx for kw in keywords):
                entity.score = min(1.0, entity.score + boost)
        for etype, keywords, penalty in CONTEXT_SUPPRESSION:
            if entity.entity_type == etype and any(kw in ctx for kw in keywords):
                entity.score = max(0.0, entity.score + penalty)
    return entities


# ---------------------------------------------------------------------------
# Voting + merge
# ---------------------------------------------------------------------------

def merge_and_vote(candidates: list[DetectedEntity]) -> list[DetectedEntity]:
    if not candidates:
        return []

    candidates.sort(key=lambda e: (e.start, -e.score))
    groups: list[list[DetectedEntity]] = []
    current_group = [candidates[0]]
    group_end = candidates[0].end

    for entity in candidates[1:]:
        if entity.start < group_end:
            current_group.append(entity)
            group_end = max(group_end, entity.end)
        else:
            groups.append(current_group)
            current_group = [entity]
            group_end = entity.end
    groups.append(current_group)

    merged = []
    for group in groups:
        locked = [e for e in group if e.type_locked]
        if locked:
            elected_type = max(locked, key=lambda e: e.score).entity_type
        else:
            type_weights: dict[str, float] = {}
            for e in group:
                w = SOURCE_WEIGHTS.get(e.source.value, 1.0)
                type_weights[e.entity_type] = (
                    type_weights.get(e.entity_type, 0.0) + e.score * w
                )
            elected_type = max(type_weights, key=type_weights.__getitem__)

        total_w = sum(SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group)
        weighted_score = sum(
            e.score * SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group
        ) / total_w

        if weighted_score < CONFIDENCE_THRESHOLD:
            continue

        # Apply per-type floor
        floor = TYPE_FLOOR.get(elected_type, CONFIDENCE_THRESHOLD)
        if weighted_score < floor:
            continue

        best = max(group, key=lambda e: e.score * SOURCE_WEIGHTS.get(e.source.value, 1.0))
        sources = list({e.source for e in group})
        merged.append(DetectedEntity(
            start=best.start, end=best.end, entity_type=elected_type,
            text=best.text, score=min(weighted_score, 1.0),
            source=DetectionSource.MERGED if len(sources) > 1 else sources[0],
            context=best.context, merged_from=sources,
        ))

    return merged


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

class DetectionPipeline:
    def __init__(self, use_transformer: bool = True):
        model = "en_core_web_trf" if use_transformer else "en_core_web_lg"
        logger.info("Loading spaCy model %s …", model)
        try:
            nlp = spacy.load(model)
        except OSError:
            logger.warning("%s not found, falling back to en_core_web_lg", model)
            nlp = spacy.load("en_core_web_lg")
            model = "en_core_web_lg"

        # Disable unused pipeline components to save memory + time
        disabled = [p for p in ["parser", "attribute_ruler", "lemmatizer"]
                    if p in nlp.pipe_names]
        if disabled:
            nlp.disable_pipes(*disabled)

        self.regex_stage    = RegexStage()
        self.presidio_stage = PresidioStage(model)
        self.spacy_stage    = SpacyNERStage(nlp)
        logger.info("DetectionPipeline v3.2 ready (model=%s).", model)

    def run(
        self,
        text: str,
        threshold: float = CONFIDENCE_THRESHOLD,
        enabled_stages: Optional[list[str]] = None,
        clean_ocr: bool = False,
    ) -> list[DetectedEntity]:
        stages = enabled_stages or ["regex", "presidio", "spacy"]

        # Optional OCR cleaning
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
        logger.info("Pipeline: %d raw → %d entities", len(all_candidates), len(result))
        return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_context(text: str, start: int, end: int, window: int = 40) -> str:
    return text[max(0, start - window): min(len(text), end + window)]


# ---------------------------------------------------------------------------
# FastAPI
# ---------------------------------------------------------------------------

pipeline: Optional[DetectionPipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    # Set use_transformer=True for best accuracy (needs en_core_web_trf installed)
    # Set use_transformer=False to fall back to en_core_web_lg (faster, less accurate)
    pipeline = DetectionPipeline(use_transformer=True)
    yield


app = FastAPI(
    title="Ciphera V3 — Detection API",
    description="Multi-layer PII: Regex → Presidio → spaCy Transformer → Context → Voting",
    version="3.2.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class AnalyzeRequest(BaseModel):
    text:            str              = Field(..., min_length=1, max_length=500_000)
    threshold:       float            = Field(0.50, ge=0.0, le=1.0)
    enabled_stages:  list[str] | None = Field(None)
    include_context: bool             = Field(True)
    clean_ocr:       bool             = Field(False)


class EntityResponse(BaseModel):
    start: int; end: int; entity_type: str; text: str
    score: float; source: str; context: str; merged_from: list[str]


class AnalyzeResponse(BaseModel):
    entity_count: int
    entities:     list[EntityResponse]
    stats:        dict


@app.post("/api/v3/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    if pipeline is None:
        raise HTTPException(503, "Pipeline not ready")
    entities = pipeline.run(
        request.text, request.threshold,
        request.enabled_stages, request.clean_ocr,
    )
    dicts = [e.to_dict() for e in entities]
    if not request.include_context:
        for d in dicts: d["context"] = ""
    type_counts:   dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for e in entities:
        type_counts[e.entity_type]    = type_counts.get(e.entity_type, 0) + 1
        source_counts[e.source.value] = source_counts.get(e.source.value, 0) + 1
    return AnalyzeResponse(
        entity_count=len(entities),
        entities=[EntityResponse(**d) for d in dicts],
        stats={"by_type": type_counts, "by_source": source_counts,
               "text_length": len(request.text)},
    )


@app.get("/api/v3/health")
async def health():
    return {"status": "ok" if pipeline else "loading", "version": "3.2.0"}


@app.get("/api/v3/entities")
async def list_entity_types():
    return {"entity_types": [
        "PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "AADHAAR_NUMBER",
        "PAN_NUMBER", "GST_NUMBER", "IFSC_CODE", "VOTER_ID",
        "IN_PASSPORT", "IN_VEHICLE_REG", "CREDIT_CARD", "DATE_TIME",
        "DATE_OF_BIRTH", "LOCATION", "ORGANIZATION", "URL", "IP_ADDRESS",
    ]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("feature1_pipeline_upgrade:app", host="0.0.0.0", port=8000, reload=False)
