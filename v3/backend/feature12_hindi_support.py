"""
Ciphera V3.1.0 — Feature 12: Hindi / Devanagari PII Detection
==============================================================
Adds full Hindi language support to the detection pipeline:

  1. Devanagari digit normalisation (Hindi ० → ASCII 0)
  2. Hindi-context Presidio recognisers (Aadhaar, PAN, DOB, Phone, Address)
  3. spaCy Hindi NER stage (hi_core_news_sm / hi_core_news_md)
  4. HindiPipeline orchestrator — runs regex + Presidio + Hindi NER + voting
  5. Language detector — detects Devanagari presence, returns mode
  6. Mixed-document handler — merges English + Hindi entity passes
  7. FastAPI endpoints:
       POST /api/v3/analyze-hindi      — Hindi or mixed text analysis
       POST /api/v3/detect-language    — detect script, return mode
       POST /api/v3/analyze-mixed      — explicit bilingual merge

Install:
    python -m spacy download hi_core_news_sm
    # or for better accuracy:
    python -m spacy download hi_core_news_md
    # Tesseract Hindi language pack (for OCR — handled in feature13_ocr_hindi.py):
    # Ubuntu: apt-get install tesseract-ocr-hin
    # Windows: download hin.traineddata into tessdata folder
"""

from __future__ import annotations

import re
import logging
import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import spacy
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NlpEngineProvider

logger = logging.getLogger("ciphera.hindi")
router = APIRouter()

# ── Devanagari Unicode ranges ─────────────────────────────────────────────────
DEVANAGARI_RANGE = re.compile(r'[\u0900-\u097F\u0966-\u096F]')
DEVANAGARI_DIGITS = str.maketrans('०१२३४५६७८९', '0123456789')

# ── Common Hindi PII field labels (used as context keywords) ──────────────────
HINDI_LABELS = {
    "AADHAAR_NUMBER": [
        "आधार", "आधार संख्या", "आधार नं", "आधार नंबर",
        "uid", "uidai", "यूआईडी",
    ],
    "PAN_NUMBER": [
        "स्थायी खाता संख्या", "पैन", "पैन नं", "पैन नंबर",
        "pan", "income tax",
    ],
    "DATE_OF_BIRTH": [
        "जन्म तिथि", "जन्मतिथि", "जन्म दिनांक", "dob",
        "जन्म", "उम्र", "आयु",
    ],
    "PHONE_NUMBER": [
        "मोबाइल", "फोन", "दूरभाष", "संपर्क", "mobile", "phone",
    ],
    "PERSON": [
        "नाम", "आवेदक", "आवेदिका", "पिता का नाम", "माता का नाम",
        "name", "applicant", "श्री", "श्रीमती", "कुमारी", "डॉ",
    ],
    "ADDRESS": [
        "पता", "पूरा पता", "ग्राम", "गाँव", "जिला", "राज्य",
        "पिन कोड", "तहसील", "मोहल्ला", "नगर", "शहर", "गली",
        "address", "village", "district", "state", "pin",
    ],
    "GSTIN": [
        "जीएसटी", "जीएसटीआईएन", "gst", "gstin",
    ],
    "IFSC_CODE": [
        "आईएफएससी", "ifsc", "बैंक", "bank",
    ],
    "VOTER_ID": [
        "मतदाता पहचान", "वोटर आईडी", "voter", "election",
    ],
}

# ── Devanagari-script month names ─────────────────────────────────────────────
_HI_MONTHS = (
    r"(?:जनवरी|फरवरी|मार्च|अप्रैल|मई|जून|"
    r"जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर)"
)

# ── Detection source enum (mirrors feature1) ──────────────────────────────────
class DetectionSource(str, Enum):
    REGEX    = "regex"
    PRESIDIO = "presidio"
    SPACY_HI = "spacy_hi"
    MERGED   = "merged"


@dataclass
class HindiEntity:
    start:       int
    end:         int
    entity_type: str
    text:        str
    score:       float
    source:      DetectionSource
    context:     str = ""
    merged_from: list[DetectionSource] = field(default_factory=list)

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
            "language":    "hi",
        }


# ── Utility functions ─────────────────────────────────────────────────────────

def normalise_devanagari_digits(text: str) -> str:
    """Convert Devanagari digit characters to ASCII digits for regex matching."""
    return text.translate(DEVANAGARI_DIGITS)


def detect_script(text: str) -> dict:
    """
    Detect what scripts are present in the text.
    Returns: {mode, devanagari_ratio, has_devanagari, has_latin}
    """
    if not text.strip():
        return {"mode": "unknown", "devanagari_ratio": 0.0,
                "has_devanagari": False, "has_latin": False}

    total_alpha = sum(1 for c in text if c.isalpha())
    if total_alpha == 0:
        return {"mode": "unknown", "devanagari_ratio": 0.0,
                "has_devanagari": False, "has_latin": False}

    deva_count  = sum(1 for c in text if '\u0900' <= c <= '\u097F')
    latin_count = sum(1 for c in text if c.isascii() and c.isalpha())
    deva_ratio  = deva_count / total_alpha

    has_deva  = deva_ratio > 0.05
    has_latin = latin_count / total_alpha > 0.05

    if has_deva and has_latin:
        mode = "mixed"
    elif has_deva:
        mode = "hindi"
    else:
        mode = "english"

    return {
        "mode":              mode,
        "devanagari_ratio":  round(deva_ratio, 3),
        "has_devanagari":    has_deva,
        "has_latin":         has_latin,
        "devanagari_chars":  deva_count,
        "latin_chars":       latin_count,
    }


def get_context(text: str, start: int, end: int, window: int = 60) -> str:
    return text[max(0, start - window): min(len(text), end + window)]


# ── Stage 1: Hindi Regex ──────────────────────────────────────────────────────

class HindiRegexStage:
    """
    Regex patterns that work on Devanagari text.
    Operates on the normalised text (Devanagari digits → ASCII)
    but maps matches back to original offsets.
    """

    # Aadhaar patterns with Hindi context labels
    _AADHAAR_WITH_LABEL = re.compile(
        r'(?:आधार(?:\s*संख्या|\s*नं\.?|\s*नंबर)?\s*[:\-]?\s*)'
        r'(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})',
        re.UNICODE
    )
    _AADHAAR_BARE = re.compile(
        r'\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b',
        re.UNICODE
    )

    # PAN with Hindi label
    _PAN_WITH_LABEL = re.compile(
        r'(?:(?:स्थायी\s*खाता\s*संख्या|पैन(?:\s*नं\.?|\s*नंबर)?)\s*[:\-]?\s*)'
        r'([A-Z]{5}[0-9]{4}[A-Z])',
        re.UNICODE | re.IGNORECASE
    )
    _PAN_BARE = re.compile(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', re.UNICODE)

    # DOB in Hindi — जन्म तिथि: DD/MM/YYYY or DD Month YYYY (Hindi months)
    _DOB_HINDI = re.compile(
        r'(?:जन्म\s*(?:तिथि|दिनांक)\s*[:\-]?\s*)'
        r'((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](?:19|20)\d{2})'
        r'|(?:\d{1,2}\s+' + _HI_MONTHS + r'\s+(?:19|20)\d{2}))',
        re.UNICODE
    )

    # Phone with Hindi label
    _PHONE_HINDI = re.compile(
        r'(?:(?:मोबाइल|फोन|दूरभाष|संपर्क)\s*(?:नं\.?|नंबर)?\s*[:\-]?\s*)'
        r'(\+?91[\s\-]?[6-9]\d{4}[\s\-]?\d{5}|[6-9]\d{9})',
        re.UNICODE
    )

    # Pin code in Hindi address context
    _PINCODE_HINDI = re.compile(
        r'(?:पिन\s*(?:कोड)?\s*[:\-]?\s*)(\d{6})\b',
        re.UNICODE
    )

    # GSTIN with Hindi label
    _GST_HINDI = re.compile(
        r'(?:(?:जीएसटी(?:आईएन)?|gst(?:in)?)\s*[:\-]?\s*)'
        r'(\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])',
        re.UNICODE | re.IGNORECASE
    )

    def analyse(self, text: str) -> list[HindiEntity]:
        # Work on digit-normalised text for number patterns
        norm = normalise_devanagari_digits(text)
        results: list[HindiEntity] = []

        # Aadhaar with label (high confidence)
        for m in self._AADHAAR_WITH_LABEL.finditer(norm):
            digits = re.sub(r'\D', '', m.group(1))
            if len(digits) == 12 and digits[0] not in '01':
                results.append(HindiEntity(
                    start=m.start(), end=m.end(),
                    entity_type="AADHAAR_NUMBER",
                    text=text[m.start():m.end()],
                    score=0.92, source=DetectionSource.REGEX,
                    context=get_context(text, m.start(), m.end()),
                ))

        # PAN with label
        for m in self._PAN_WITH_LABEL.finditer(norm):
            results.append(HindiEntity(
                start=m.start(), end=m.end(),
                entity_type="PAN_NUMBER",
                text=text[m.start():m.end()],
                score=0.95, source=DetectionSource.REGEX,
                context=get_context(text, m.start(), m.end()),
            ))

        # DOB with Hindi label
        for m in self._DOB_HINDI.finditer(norm):
            results.append(HindiEntity(
                start=m.start(), end=m.end(),
                entity_type="DATE_OF_BIRTH",
                text=text[m.start():m.end()],
                score=0.90, source=DetectionSource.REGEX,
                context=get_context(text, m.start(), m.end()),
            ))

        # Phone with Hindi label
        for m in self._PHONE_HINDI.finditer(norm):
            results.append(HindiEntity(
                start=m.start(), end=m.end(),
                entity_type="PHONE_NUMBER",
                text=text[m.start():m.end()],
                score=0.88, source=DetectionSource.REGEX,
                context=get_context(text, m.start(), m.end()),
            ))

        # Pin code with Hindi label
        for m in self._PINCODE_HINDI.finditer(norm):
            results.append(HindiEntity(
                start=m.start(), end=m.end(),
                entity_type="PIN_CODE",
                text=text[m.start():m.end()],
                score=0.85, source=DetectionSource.REGEX,
                context=get_context(text, m.start(), m.end()),
            ))

        # GST with Hindi label
        for m in self._GST_HINDI.finditer(norm):
            results.append(HindiEntity(
                start=m.start(), end=m.end(),
                entity_type="GST_NUMBER",
                text=text[m.start():m.end()],
                score=0.93, source=DetectionSource.REGEX,
                context=get_context(text, m.start(), m.end()),
            ))

        return results


# ── Stage 2: Hindi Presidio Recognisers ───────────────────────────────────────

def build_hindi_presidio_engine(nlp_model: str = "hi_core_news_sm") -> AnalyzerEngine:
    """
    Builds a Presidio AnalyzerEngine configured for Hindi.
    Uses spaCy's Hindi model for NLP backbone.
    """
    try:
        provider = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "hi", "model_name": nlp_model}],
        })
        engine = AnalyzerEngine(
            nlp_engine=provider.create_engine(),
            supported_languages=["hi", "en"],
        )
    except Exception as e:
        logger.warning("Hindi Presidio engine failed: %s — using English engine fallback", e)
        # Fall back to English engine with Hindi recognisers bolted on
        from presidio_analyzer import AnalyzerEngine as AE
        engine = AE(supported_languages=["en"])

    # Add Hindi-specific recognisers
    hindi_recognisers = [
        PatternRecognizer(
            supported_entity="AADHAAR_NUMBER",
            supported_language="hi",
            patterns=[
                Pattern("AADHAAR_SPACED_HI", r"\b\d{4}[\s\-]\d{4}[\s\-]\d{4}\b", 0.85),
                Pattern("AADHAAR_COMPACT_HI", r"\b[2-9]\d{11}\b", 0.55),
            ],
            context=[
                "आधार", "आधार संख्या", "आधार नं", "uid", "uidai",
            ],
        ),
        PatternRecognizer(
            supported_entity="PAN_NUMBER",
            supported_language="hi",
            patterns=[
                Pattern("PAN_HI", r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", 0.95),
            ],
            context=["पैन", "स्थायी खाता", "pan"],
        ),
        PatternRecognizer(
            supported_entity="PHONE_NUMBER",
            supported_language="hi",
            patterns=[
                Pattern("PHONE_HI_91", r"\+?91[\s\-]?[6-9]\d{4}[\s\-]?\d{5}", 0.88),
                Pattern("PHONE_HI_10", r"\b[6-9]\d{9}\b", 0.80),
            ],
            context=["मोबाइल", "फोन", "दूरभाष", "संपर्क", "mobile", "phone"],
        ),
        PatternRecognizer(
            supported_entity="GST_NUMBER",
            supported_language="hi",
            patterns=[
                Pattern("GST_HI", r"\b\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", 0.93),
            ],
            context=["जीएसटी", "gst", "gstin", "invoice"],
        ),
        PatternRecognizer(
            supported_entity="IFSC_CODE",
            supported_language="hi",
            patterns=[
                Pattern("IFSC_HI", r"\b[A-Z]{4}0[A-Z0-9]{6}\b", 0.90),
            ],
            context=["आईएफएससी", "ifsc", "बैंक", "bank", "neft", "rtgs"],
        ),
        PatternRecognizer(
            supported_entity="VOTER_ID",
            supported_language="hi",
            patterns=[
                Pattern("VOTER_HI", r"\b[A-Z]{3}[0-9]{7}\b", 0.78),
            ],
            context=["मतदाता", "वोटर", "voter", "election"],
        ),
        PatternRecognizer(
            supported_entity="PIN_CODE",
            supported_language="hi",
            patterns=[
                Pattern("PIN_HI", r"\b[1-9]\d{5}\b", 0.72),
            ],
            context=["पिन", "पिन कोड", "pin", "pincode", "postal"],
        ),
    ]

    for rec in hindi_recognisers:
        engine.registry.add_recognizer(rec)

    logger.info("Hindi Presidio engine built with %d recognisers", len(engine.registry.recognizers))
    return engine


class HindiPresidioStage:
    TARGET_ENTITIES = [
        "PERSON", "LOCATION", "ORGANIZATION",
        "AADHAAR_NUMBER", "PAN_NUMBER", "PHONE_NUMBER",
        "EMAIL_ADDRESS", "GST_NUMBER", "IFSC_CODE",
        "VOTER_ID", "PIN_CODE", "DATE_TIME",
    ]

    def __init__(self, engine: AnalyzerEngine):
        self.engine = engine

    def analyse(self, text: str, language: str = "hi") -> list[HindiEntity]:
        norm = normalise_devanagari_digits(text)
        results: list[HindiEntity] = []

        try:
            detections = self.engine.analyze(
                text=norm,
                entities=self.TARGET_ENTITIES,
                language=language if language in ("hi", "en") else "en",
            )
        except Exception as e:
            logger.warning("Hindi Presidio analyse failed: %s", e)
            return []

        for r in detections:
            span = text[r.start:r.end]
            results.append(HindiEntity(
                start=r.start, end=r.end,
                entity_type=r.entity_type,
                text=span, score=r.score,
                source=DetectionSource.PRESIDIO,
                context=get_context(text, r.start, r.end),
            ))
        return results


# ── Stage 3: spaCy Hindi NER ──────────────────────────────────────────────────

class SpacyHindiNERStage:
    """
    Uses hi_core_news_sm or hi_core_news_md for Hindi named entity recognition.
    Maps Hindi spaCy labels to Ciphera entity types.
    """

    # spaCy Hindi model label → Ciphera entity type
    LABEL_MAP = {
        "PERSON":    "PERSON",
        "PER":       "PERSON",
        "ORG":       "ORGANIZATION",
        "GPE":       "LOCATION",
        "LOC":       "LOCATION",
        "GEO":       "LOCATION",
    }

    def __init__(self, nlp: spacy.Language):
        self.nlp = nlp

    def analyse(self, text: str) -> list[HindiEntity]:
        results: list[HindiEntity] = []
        try:
            doc = self.nlp(text)
        except Exception as e:
            logger.warning("spaCy Hindi NER failed: %s", e)
            return []

        for ent in doc.ents:
            mapped = self.LABEL_MAP.get(ent.label_)
            if not mapped:
                continue
            # Skip very short entities (single character)
            if len(ent.text.strip()) < 2:
                continue

            # Context boost for Hindi titles
            score = 0.68
            ctx = get_context(text, ent.start_char, ent.end_char, 40).lower()
            if mapped == "PERSON" and any(
                t in ctx for t in ["श्री", "श्रीमती", "कुमारी", "डॉ", "shri", "smt", "dr"]
            ):
                score = 0.80

            results.append(HindiEntity(
                start=ent.start_char, end=ent.end_char,
                entity_type=mapped, text=ent.text,
                score=score, source=DetectionSource.SPACY_HI,
                context=get_context(text, ent.start_char, ent.end_char),
            ))
        return results


# ── Context scoring (Hindi) ───────────────────────────────────────────────────

def apply_hindi_context_scoring(
    entities: list[HindiEntity], text: str
) -> list[HindiEntity]:
    for entity in entities:
        ctx = get_context(text, entity.start, entity.end, 80).lower()
        # Check all Hindi label keywords for this entity type
        keywords = HINDI_LABELS.get(entity.entity_type, [])
        if any(kw.lower() in ctx for kw in keywords):
            entity.score = min(1.0, entity.score + 0.10)
        # Suppress false positives
        if entity.entity_type == "AADHAAR_NUMBER":
            if any(kw in ctx for kw in ["order", "tracking", "invoice", "version"]):
                entity.score = max(0.0, entity.score - 0.25)
    return entities


# ── Voting + merge (Hindi) ────────────────────────────────────────────────────

SOURCE_WEIGHTS_HI = {
    DetectionSource.REGEX:    1.4,
    DetectionSource.PRESIDIO: 1.0,
    DetectionSource.SPACY_HI: 0.9,
}

CONFIDENCE_THRESHOLD_HI = 0.48   # slightly lower than English — Hindi NER is less mature

def merge_hindi_entities(candidates: list[HindiEntity]) -> list[HindiEntity]:
    if not candidates:
        return []

    candidates.sort(key=lambda e: (e.start, -e.score))
    groups: list[list[HindiEntity]] = []
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

    merged: list[HindiEntity] = []
    for group in groups:
        # High-confidence regex results lock the entity type
        locked = [e for e in group if e.source == DetectionSource.REGEX and e.score >= 0.80]
        if locked:
            elected_type = max(locked, key=lambda e: e.score).entity_type
        else:
            tw: dict[str, float] = {}
            for e in group:
                w = SOURCE_WEIGHTS_HI.get(e.source, 1.0)
                tw[e.entity_type] = tw.get(e.entity_type, 0.0) + e.score * w
            elected_type = max(tw, key=tw.__getitem__)

        total_w = sum(SOURCE_WEIGHTS_HI.get(e.source, 1.0) for e in group)
        wscore = sum(
            e.score * SOURCE_WEIGHTS_HI.get(e.source, 1.0) for e in group
        ) / total_w

        if wscore < CONFIDENCE_THRESHOLD_HI:
            continue

        best = max(group, key=lambda e: e.score * SOURCE_WEIGHTS_HI.get(e.source, 1.0))
        sources = list({e.source for e in group})
        merged.append(HindiEntity(
            start=best.start, end=best.end,
            entity_type=elected_type,
            text=best.text, score=min(wscore, 1.0),
            source=DetectionSource.MERGED if len(sources) > 1 else sources[0],
            context=best.context, merged_from=sources,
        ))

    return merged


# ── Hindi Pipeline Orchestrator ───────────────────────────────────────────────

class HindiPipeline:
    """
    Full Hindi detection pipeline:
    Regex → Presidio (Hindi) → spaCy Hindi NER → Context scoring → Voting
    """

    def __init__(self):
        self.ready = False
        self._nlp_hi: Optional[spacy.Language] = None
        self._presidio: Optional[HindiPresidioStage] = None
        self._regex = HindiRegexStage()
        self._spacy: Optional[SpacyHindiNERStage] = None
        self._load()

    def _load(self):
        # Load spaCy Hindi model — try md first, fall back to sm
        for model_name in ["hi_core_news_md", "hi_core_news_sm"]:
            try:
                nlp = spacy.load(model_name)
                # Disable unused components for speed
                disabled = [p for p in ["parser", "lemmatizer", "morphologizer"]
                            if p in nlp.pipe_names]
                if disabled:
                    nlp.disable_pipes(*disabled)
                self._nlp_hi = nlp
                self._spacy  = SpacyHindiNERStage(nlp)
                logger.info("Hindi spaCy model loaded: %s", model_name)
                break
            except OSError:
                logger.warning("spaCy model %s not found", model_name)

        if self._nlp_hi is None:
            logger.warning(
                "No Hindi spaCy model found. Install with: "
                "python -m spacy download hi_core_news_sm"
            )

        # Build Presidio engine with Hindi model
        hindi_model = "hi_core_news_sm" if self._nlp_hi else "en_core_web_sm"
        try:
            engine = build_hindi_presidio_engine(hindi_model)
            self._presidio = HindiPresidioStage(engine)
        except Exception as e:
            logger.warning("Hindi Presidio stage failed to init: %s", e)

        self.ready = True
        logger.info(
            "HindiPipeline ready — spaCy: %s, Presidio: %s",
            "ok" if self._spacy else "missing",
            "ok" if self._presidio else "missing",
        )

    def run(
        self,
        text: str,
        threshold: float = CONFIDENCE_THRESHOLD_HI,
        language_hint: str = "auto",
    ) -> list[HindiEntity]:
        """
        Run all Hindi detection stages.
        language_hint: "hi" | "en" | "mixed" | "auto"
        """
        if not text.strip():
            return []

        # Auto-detect language if not specified
        if language_hint == "auto":
            info = detect_script(text)
            language_hint = info["mode"]

        # Normalise Devanagari digits for processing
        norm = normalise_devanagari_digits(text)

        all_candidates: list[HindiEntity] = []

        # Stage 1: Hindi regex (always runs)
        all_candidates.extend(self._regex.analyse(text))

        # Stage 2: Presidio
        if self._presidio:
            lang = "hi" if language_hint in ("hindi", "mixed") else "en"
            all_candidates.extend(self._presidio.analyse(norm, language=lang))

        # Stage 3: spaCy Hindi NER (only if Devanagari present)
        if self._spacy and language_hint in ("hindi", "mixed"):
            all_candidates.extend(self._spacy.analyse(text))

        # Context scoring
        all_candidates = apply_hindi_context_scoring(all_candidates, text)

        # Vote + merge
        merged = merge_hindi_entities(all_candidates)

        # Filter by threshold
        result = sorted(
            [e for e in merged if e.score >= threshold],
            key=lambda e: e.start,
        )

        logger.info(
            "HindiPipeline [%s]: %d raw → %d entities",
            language_hint, len(all_candidates), len(result),
        )
        return result


# ── Mixed Document Handler ────────────────────────────────────────────────────

class MixedDocumentHandler:
    """
    Merges entity detections from English pipeline + Hindi pipeline.
    Deduplicates overlapping entities, preferring higher-confidence detection.
    """

    def merge_english_and_hindi(
        self,
        english_entities: list,   # list of DetectedEntity from feature1
        hindi_entities:   list[HindiEntity],
    ) -> list[dict]:
        """
        Merge two entity lists. Both have .start, .end, .entity_type, .score.
        Returns unified list of dicts.
        """
        combined: list[dict] = []

        for e in english_entities:
            combined.append({
                "start": e.start, "end": e.end,
                "entity_type": e.entity_type, "text": e.text,
                "score": e.score, "source": e.source.value,
                "context": e.context, "language": "en",
            })

        for e in hindi_entities:
            combined.append(e.to_dict())

        # Sort by position
        combined.sort(key=lambda x: (x["start"], -x["score"]))

        # Dedup: remove lower-confidence overlapping entities
        deduped: list[dict] = []
        for entity in combined:
            overlap = False
            for kept in deduped:
                # Check overlap
                if entity["start"] < kept["end"] and entity["end"] > kept["start"]:
                    # Overlapping — keep higher score
                    if entity["score"] > kept["score"]:
                        deduped.remove(kept)
                    else:
                        overlap = True
                    break
            if not overlap:
                deduped.append(entity)

        return sorted(deduped, key=lambda x: x["start"])


# ── Language Detector ─────────────────────────────────────────────────────────

class LanguageDetector:
    """
    Detects script composition of a document.
    Used by frontend to auto-switch pipeline mode.
    """

    def detect(self, text: str) -> dict:
        info = detect_script(text)

        # Add human-readable label
        mode_labels = {
            "hindi":   "HINDI",
            "english": "ENGLISH",
            "mixed":   "HINDI + ENGLISH",
            "unknown": "UNKNOWN",
        }
        info["label"]              = mode_labels.get(info["mode"], "UNKNOWN")
        info["recommended_stages"] = self._recommend_stages(info)
        return info

    def _recommend_stages(self, info: dict) -> list[str]:
        mode = info["mode"]
        if mode == "hindi":
            return ["hindi_regex", "hindi_presidio", "spacy_hi"]
        elif mode == "mixed":
            return ["regex", "presidio", "spacy", "hindi_regex", "hindi_presidio", "spacy_hi"]
        else:
            return ["regex", "presidio", "spacy"]


# ── Global instances ──────────────────────────────────────────────────────────

hindi_pipeline    = HindiPipeline()
mixed_handler     = MixedDocumentHandler()
language_detector = LanguageDetector()


# ── FastAPI models ────────────────────────────────────────────────────────────

class HindiAnalyzeRequest(BaseModel):
    text:          str   = Field(..., min_length=1, max_length=500_000)
    threshold:     float = Field(0.48, ge=0.0, le=1.0)
    language_hint: str   = Field("auto", description="auto | hi | en | mixed")

class DetectLanguageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100_000)

class MixedAnalyzeRequest(BaseModel):
    text:              str   = Field(..., min_length=1, max_length=500_000)
    threshold_english: float = Field(0.50, ge=0.0, le=1.0)
    threshold_hindi:   float = Field(0.48, ge=0.0, le=1.0)

class HindiEntityResponse(BaseModel):
    start: int; end: int; entity_type: str; text: str
    score: float; source: str; context: str; language: str

class HindiAnalyzeResponse(BaseModel):
    entity_count:  int
    entities:      list[HindiEntityResponse]
    language_info: dict
    stats:         dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/v3/detect-language")
async def detect_language(request: DetectLanguageRequest):
    """
    Detect what language/script is in the uploaded text.
    Returns: mode (hindi/english/mixed), ratio, recommended pipeline stages.
    Frontend uses this to show the LANGUAGE DETECTED indicator.
    """
    info = language_detector.detect(request.text)
    return {
        "mode":               info["mode"],
        "label":              info["label"],
        "devanagari_ratio":   info["devanagari_ratio"],
        "has_devanagari":     info["has_devanagari"],
        "has_latin":          info["has_latin"],
        "recommended_stages": info["recommended_stages"],
    }


@router.post("/api/v3/analyze-hindi", response_model=HindiAnalyzeResponse)
async def analyze_hindi(request: HindiAnalyzeRequest):
    """
    Analyze Hindi or mixed Hindi-English text for PII.
    Runs: Hindi Regex → Hindi Presidio → spaCy Hindi NER → Voting.
    """
    if not hindi_pipeline.ready:
        raise HTTPException(503, "Hindi pipeline not ready")

    entities = hindi_pipeline.run(
        request.text,
        threshold=request.threshold,
        language_hint=request.language_hint,
    )

    lang_info = language_detector.detect(request.text)

    type_counts:   dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for e in entities:
        type_counts[e.entity_type]    = type_counts.get(e.entity_type, 0) + 1
        source_counts[e.source.value] = source_counts.get(e.source.value, 0) + 1

    return HindiAnalyzeResponse(
        entity_count=len(entities),
        entities=[
            HindiEntityResponse(
                start=e.start, end=e.end,
                entity_type=e.entity_type,
                text=e.text, score=round(e.score, 4),
                source=e.source.value,
                context=e.context, language="hi",
            )
            for e in entities
        ],
        language_info=lang_info,
        stats={
            "by_type":    type_counts,
            "by_source":  source_counts,
            "text_length": len(request.text),
            "mode":        lang_info["mode"],
        },
    )


@router.post("/api/v3/analyze-mixed")
async def analyze_mixed(request: MixedAnalyzeRequest):
    """
    Full bilingual analysis: runs BOTH the English pipeline and Hindi pipeline,
    merges results, deduplicates overlaps.
    Use this for documents that are confirmed bilingual.
    """
    if not hindi_pipeline.ready:
        raise HTTPException(503, "Hindi pipeline not ready")

    # Import English pipeline
    from feature1_pipeline_upgrade import pipeline as english_pipeline
    if english_pipeline is None:
        raise HTTPException(503, "English pipeline not ready")

    # Run both pipelines
    en_entities = english_pipeline.run(request.text, threshold=request.threshold_english)
    hi_entities = hindi_pipeline.run(
        request.text,
        threshold=request.threshold_hindi,
        language_hint="mixed",
    )

    # Merge and deduplicate
    merged = mixed_handler.merge_english_and_hindi(en_entities, hi_entities)

    lang_info = language_detector.detect(request.text)

    type_counts:  dict[str, int] = {}
    lang_counts:  dict[str, int] = {}
    for e in merged:
        type_counts[e["entity_type"]]   = type_counts.get(e["entity_type"], 0) + 1
        lang_counts[e.get("language","en")] = lang_counts.get(e.get("language","en"), 0) + 1

    return {
        "entity_count":  len(merged),
        "entities":      merged,
        "language_info": lang_info,
        "stats": {
            "by_type":      type_counts,
            "by_language":  lang_counts,
            "english_found": len(en_entities),
            "hindi_found":   len(hi_entities),
            "text_length":   len(request.text),
        },
    }
