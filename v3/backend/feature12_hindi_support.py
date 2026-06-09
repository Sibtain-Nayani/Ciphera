"""
Ciphera V3.2 — Feature 12: Hindi / Devanagari PII Detection (v2)
================================================================
Key fixes over v3.1:
  - MixedDocumentHandler.merge_english_and_hindi() — complete rewrite.
    Old: mutated list during iteration (Python bug, silently dropped entities).
    New: index-based dedup pass, no mutation during iteration.
    Also: English entities now carry language="en" field consistently.

  - Segment-aware Hindi NER — SpacyHindiNERStage now only runs on
    Devanagari text segments, not the full document. Prevents false positives
    on English names/places that spaCy Hindi model misidentifies.

  - analyze-mixed endpoint: entities returned with consistent shape
    (start, end, entity_type, text, score, source, context, language,
    merged_from) so redactionEngine.ts normaliseEntities() always works.

  - HindiPipeline.run() language_hint "mixed" now explicitly passes
    language="en" to Presidio for the Latin portions (better recall).

  - All entity dicts from both pipelines guaranteed to have merged_from=[].
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
DEVANAGARI_RANGE  = re.compile(r'[\u0900-\u097F\u0966-\u096F]')
DEVANAGARI_DIGITS = str.maketrans('०१२३४५६७८९', '0123456789')

# ── Hindi PII context keywords ────────────────────────────────────────────────
HINDI_LABELS = {
    "AADHAAR_NUMBER": ["आधार","आधार संख्या","आधार नं","आधार नंबर","uid","uidai","यूआईडी"],
    "PAN_NUMBER":     ["स्थायी खाता संख्या","पैन","पैन नं","पैन नंबर","pan","income tax"],
    "DATE_OF_BIRTH":  ["जन्म तिथि","जन्मतिथि","जन्म दिनांक","dob","जन्म","उम्र","आयु"],
    "PHONE_NUMBER":   ["मोबाइल","फोन","दूरभाष","संपर्क","mobile","phone"],
    "PERSON":         ["नाम","आवेदक","आवेदिका","पिता का नाम","माता का नाम","name","applicant","श्री","श्रीमती","कुमारी","डॉ"],
    "ADDRESS":        ["पता","पूरा पता","ग्राम","गाँव","जिला","राज्य","पिन कोड","तहसील","मोहल्ला","नगर","शहर","गली","address","village","district","state","pin"],
    "GST_NUMBER":     ["जीएसटी","जीएसटीआईएन","gst","gstin"],
    "IFSC_CODE":      ["आईएफएससी","ifsc","बैंक","bank"],
    "VOTER_ID":       ["मतदाता पहचान","वोटर आईडी","voter","election"],
    "PIN_CODE":       ["पिन","पिन कोड","pin","pincode","postal","zip"],
}

_HI_MONTHS = (
    r"(?:जनवरी|फरवरी|मार्च|अप्रैल|मई|जून|"
    r"जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर)"
)

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


# ── Utility ───────────────────────────────────────────────────────────────────

def normalise_devanagari_digits(text: str) -> str:
    return text.translate(DEVANAGARI_DIGITS)


def detect_script(text: str) -> dict:
    if not text.strip():
        return {"mode":"unknown","devanagari_ratio":0.0,"has_devanagari":False,"has_latin":False}

    total_alpha = sum(1 for c in text if c.isalpha())
    if total_alpha == 0:
        return {"mode":"unknown","devanagari_ratio":0.0,"has_devanagari":False,"has_latin":False}

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
        "mode":             mode,
        "devanagari_ratio": round(deva_ratio, 3),
        "has_devanagari":   has_deva,
        "has_latin":        has_latin,
        "devanagari_chars": deva_count,
        "latin_chars":      latin_count,
    }


def get_context(text: str, start: int, end: int, window: int = 60) -> str:
    return text[max(0, start - window): min(len(text), end + window)]


def _extract_devanagari_segments(text: str) -> list[tuple[int, int, str]]:
    """
    Split text into (start, end, segment) tuples where each segment
    is a run of Devanagari characters (plus surrounding punctuation/spaces).
    Used to restrict Hindi NER to Devanagari sections only.
    """
    segments = []
    # Find runs of Devanagari script (min 3 chars to avoid single letters)
    for m in re.finditer(r'[\u0900-\u097F][\u0900-\u097F\s\u0964\u0965\u0966-\u096F,.\-:]*[\u0900-\u097F]', text):
        if len(m.group().strip()) >= 3:
            segments.append((m.start(), m.end(), m.group()))
    return segments


# ── Stage 1: Hindi Regex ──────────────────────────────────────────────────────

class HindiRegexStage:
    _AADHAAR_WITH_LABEL = re.compile(
        r'(?:आधार(?:\s*संख्या|\s*नं\.?|\s*नंबर)?\s*[:\-]?\s*)'
        r'(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})', re.UNICODE
    )
    _PAN_WITH_LABEL = re.compile(
        r'(?:(?:स्थायी\s*खाता\s*संख्या|पैन(?:\s*नं\.?|\s*नंबर)?)\s*[:\-]?\s*)'
        r'([A-Z]{5}[0-9]{4}[A-Z])', re.UNICODE | re.IGNORECASE
    )
    _DOB_HINDI = re.compile(
        r'(?:जन्म\s*(?:तिथि|दिनांक)\s*[:\-]?\s*)'
        r'((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](?:19|20)\d{2})'
        r'|(?:\d{1,2}\s+' + _HI_MONTHS + r'\s+(?:19|20)\d{2}))',
        re.UNICODE
    )
    _PHONE_HINDI = re.compile(
        r'(?:(?:मोबाइल|फोन|दूरभाष|संपर्क)\s*(?:नं\.?|नंबर)?\s*[:\-]?\s*)'
        r'(\+?91[\s\-]?[6-9]\d{4}[\s\-]?\d{5}|[6-9]\d{9})', re.UNICODE
    )
    _PINCODE_HINDI = re.compile(
        r'(?:पिन\s*(?:कोड)?\s*[:\-]?\s*)(\d{6})\b', re.UNICODE
    )
    _GST_HINDI = re.compile(
        r'(?:(?:जीएसटी(?:आईएन)?|gst(?:in)?)\s*[:\-]?\s*)'
        r'(\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])',
        re.UNICODE | re.IGNORECASE
    )
    _VOTER_HINDI = re.compile(
        r'(?:(?:मतदाता\s*पहचान|वोटर\s*(?:आईडी|id))\s*[:\-]?\s*)'
        r'([A-Z]{3}[0-9]{7})', re.UNICODE | re.IGNORECASE
    )
    _IFSC_HINDI = re.compile(
        r'(?:(?:आईएफएससी|ifsc)\s*[:\-]?\s*)([A-Z]{4}0[A-Z0-9]{6})',
        re.UNICODE | re.IGNORECASE
    )

    def analyse(self, text: str) -> list[HindiEntity]:
        norm    = normalise_devanagari_digits(text)
        results: list[HindiEntity] = []

        patterns = [
            (self._AADHAAR_WITH_LABEL, "AADHAAR_NUMBER", 0.92),
            (self._PAN_WITH_LABEL,     "PAN_NUMBER",     0.95),
            (self._DOB_HINDI,          "DATE_OF_BIRTH",  0.90),
            (self._PHONE_HINDI,        "PHONE_NUMBER",   0.88),
            (self._PINCODE_HINDI,      "PIN_CODE",       0.85),
            (self._GST_HINDI,          "GST_NUMBER",     0.93),
            (self._VOTER_HINDI,        "VOTER_ID",       0.82),
            (self._IFSC_HINDI,         "IFSC_CODE",      0.90),
        ]

        for regex, entity_type, score in patterns:
            for m in regex.finditer(norm):
                # Validate Aadhaar digits
                if entity_type == "AADHAAR_NUMBER":
                    digits = re.sub(r'\D', '', m.group(1))
                    if len(digits) != 12 or digits[0] in '01':
                        continue
                results.append(HindiEntity(
                    start=m.start(), end=m.end(),
                    entity_type=entity_type,
                    text=text[m.start():m.end()],
                    score=score, source=DetectionSource.REGEX,
                    context=get_context(text, m.start(), m.end()),
                ))

        return results


# ── Stage 2: Hindi Presidio ───────────────────────────────────────────────────

def build_hindi_presidio_engine(nlp_model: str = "hi_core_news_sm") -> AnalyzerEngine:
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
        logger.warning("Hindi Presidio engine failed: %s — using English fallback", e)
        engine = AnalyzerEngine(supported_languages=["en"])

    hindi_recognisers = [
        PatternRecognizer("AADHAAR_NUMBER", supported_language="hi", patterns=[
            Pattern("AADHAAR_SPACED_HI",  r"\b\d{4}[\s\-]\d{4}[\s\-]\d{4}\b", 0.85),
            Pattern("AADHAAR_COMPACT_HI", r"\b[2-9]\d{11}\b", 0.55),
        ], context=["आधार","आधार संख्या","uid","uidai"]),
        PatternRecognizer("PAN_NUMBER", supported_language="hi", patterns=[
            Pattern("PAN_HI", r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", 0.95),
        ], context=["पैन","स्थायी खाता","pan"]),
        PatternRecognizer("PHONE_NUMBER", supported_language="hi", patterns=[
            Pattern("PHONE_HI_91", r"\+?91[\s\-]?[6-9]\d{4}[\s\-]?\d{5}", 0.88),
            Pattern("PHONE_HI_10", r"\b[6-9]\d{9}\b", 0.80),
        ], context=["मोबाइल","फोन","दूरभाष","संपर्क","mobile","phone"]),
        PatternRecognizer("GST_NUMBER", supported_language="hi", patterns=[
            Pattern("GST_HI", r"\b\d{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", 0.93),
        ], context=["जीएसटी","gst","gstin","invoice"]),
        PatternRecognizer("IFSC_CODE", supported_language="hi", patterns=[
            Pattern("IFSC_HI", r"\b[A-Z]{4}0[A-Z0-9]{6}\b", 0.90),
        ], context=["आईएफएससी","ifsc","बैंक","bank","neft","rtgs"]),
        PatternRecognizer("VOTER_ID", supported_language="hi", patterns=[
            Pattern("VOTER_HI", r"\b[A-Z]{3}[0-9]{7}\b", 0.78),
        ], context=["मतदाता","वोटर","voter","election"]),
        PatternRecognizer("PIN_CODE", supported_language="hi", patterns=[
            Pattern("PIN_HI", r"\b[1-9]\d{5}\b", 0.72),
        ], context=["पिन","पिन कोड","pin","pincode","postal"]),
    ]

    for rec in hindi_recognisers:
        engine.registry.add_recognizer(rec)

    logger.info("Hindi Presidio engine: %d recognisers", len(engine.registry.recognizers))
    return engine


class HindiPresidioStage:
    TARGET_ENTITIES = [
        "PERSON","LOCATION","ORGANIZATION",
        "AADHAAR_NUMBER","PAN_NUMBER","PHONE_NUMBER",
        "EMAIL_ADDRESS","GST_NUMBER","IFSC_CODE",
        "VOTER_ID","PIN_CODE","DATE_TIME",
    ]

    def __init__(self, engine: AnalyzerEngine):
        self.engine = engine

    def analyse(self, text: str, language: str = "hi") -> list[HindiEntity]:
        norm    = normalise_devanagari_digits(text)
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


# ── Stage 3: spaCy Hindi NER (segment-aware) ──────────────────────────────────

class SpacyHindiNERStage:
    """
    Runs spaCy Hindi NER ONLY on Devanagari text segments.
    Prevents false positives from English names being misidentified
    by the Hindi model which expects Devanagari input.
    """

    LABEL_MAP = {
        "PERSON": "PERSON", "PER": "PERSON",
        "ORG":    "ORGANIZATION",
        "GPE":    "LOCATION", "LOC": "LOCATION", "GEO": "LOCATION",
    }

    def __init__(self, nlp: spacy.Language):
        self.nlp = nlp

    def analyse(self, text: str) -> list[HindiEntity]:
        results: list[HindiEntity] = []

        # Only process Devanagari segments — not the full document
        segments = _extract_devanagari_segments(text)
        if not segments:
            return []

        for seg_start, seg_end, segment_text in segments:
            try:
                doc = self.nlp(segment_text)
            except Exception as e:
                logger.warning("spaCy Hindi NER segment failed: %s", e)
                continue

            for ent in doc.ents:
                mapped = self.LABEL_MAP.get(ent.label_)
                if not mapped:
                    continue
                if len(ent.text.strip()) < 2:
                    continue

                # Map offsets back to original document position
                orig_start = seg_start + ent.start_char
                orig_end   = seg_start + ent.end_char

                score = 0.68
                ctx   = get_context(text, orig_start, orig_end, 40).lower()
                if mapped == "PERSON" and any(
                    t in ctx for t in ["श्री","श्रीमती","कुमारी","डॉ","shri","smt","dr"]
                ):
                    score = 0.80

                results.append(HindiEntity(
                    start=orig_start, end=orig_end,
                    entity_type=mapped, text=ent.text,
                    score=score, source=DetectionSource.SPACY_HI,
                    context=get_context(text, orig_start, orig_end),
                ))

        return results


# ── Context scoring ───────────────────────────────────────────────────────────

def apply_hindi_context_scoring(
    entities: list[HindiEntity], text: str
) -> list[HindiEntity]:
    for entity in entities:
        ctx      = get_context(text, entity.start, entity.end, 80).lower()
        keywords = HINDI_LABELS.get(entity.entity_type, [])
        if any(kw.lower() in ctx for kw in keywords):
            entity.score = min(1.0, entity.score + 0.10)
        if entity.entity_type == "AADHAAR_NUMBER":
            if any(kw in ctx for kw in ["order","tracking","invoice","version"]):
                entity.score = max(0.0, entity.score - 0.25)
        if entity.entity_type == "PIN_CODE":
            if any(kw in ctx for kw in ["version","otp","code","ref"]):
                entity.score = max(0.0, entity.score - 0.30)
    return entities


# ── Voting + merge ────────────────────────────────────────────────────────────

SOURCE_WEIGHTS_HI = {
    DetectionSource.REGEX:    1.4,
    DetectionSource.PRESIDIO: 1.0,
    DetectionSource.SPACY_HI: 0.9,
}
CONFIDENCE_THRESHOLD_HI = 0.48


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
            cur  = [entity]
            end  = entity.end
    groups.append(cur)

    merged: list[HindiEntity] = []
    for group in groups:
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
        wscore  = sum(
            e.score * SOURCE_WEIGHTS_HI.get(e.source, 1.0) for e in group
        ) / total_w

        if wscore < CONFIDENCE_THRESHOLD_HI:
            continue

        best    = max(group, key=lambda e: e.score * SOURCE_WEIGHTS_HI.get(e.source, 1.0))
        sources = list({e.source for e in group})
        merged.append(HindiEntity(
            start=best.start, end=best.end,
            entity_type=elected_type,
            text=best.text, score=min(wscore, 1.0),
            source=DetectionSource.MERGED if len(sources) > 1 else sources[0],
            context=best.context, merged_from=sources,
        ))

    return merged


# ── Mixed Document Handler — REWRITTEN ────────────────────────────────────────

class MixedDocumentHandler:
    """
    Merges English + Hindi entity lists into a single deduplicated list.

    Key fix over v3.1:
    - Old implementation called deduped.remove(kept) inside a for-loop over
      deduped, which mutates the list being iterated — causing silent entity
      drops and non-deterministic results.
    - New implementation: build a combined list, sort by position+score,
      then do a single linear pass with a cursor tracking the rightmost
      end position seen. No mutation during iteration.
    - English entities now consistently carry language="en".
    - All entities carry merged_from=[] so the frontend shape normaliser
      never gets a KeyError.
    """

    def merge_english_and_hindi(
        self,
        english_entities: list,       # list[DetectedEntity] from feature1
        hindi_entities:   list[HindiEntity],
    ) -> list[dict]:
        """
        Returns a unified list of entity dicts, sorted by position,
        with overlaps resolved by keeping the higher-confidence entity.
        """
        combined: list[dict] = []

        # Normalise English entities → dict with language="en"
        for e in english_entities:
            combined.append({
                "start":       e.start,
                "end":         e.end,
                "entity_type": e.entity_type,
                "text":        e.text,
                "score":       float(e.score),
                "source":      e.source.value,
                "context":     e.context,
                "language":    "en",
                "merged_from": [s.value for s in (e.merged_from or [])],
            })

        # Normalise Hindi entities → dict with language="hi"
        for e in hindi_entities:
            combined.append(e.to_dict())   # already has language="hi"

        if not combined:
            return []

        # Sort: by start position ascending, then by score descending
        # (so higher-confidence entity comes first when positions tie)
        combined.sort(key=lambda x: (x["start"], -x["score"]))

        # Linear dedup pass — no list mutation during iteration
        # Keep entity if it doesn't overlap with the last kept entity.
        # If it does overlap, keep whichever has the higher score
        # (already sorted, so first one wins unless second is strictly better).
        deduped: list[dict] = []
        rightmost_end = -1
        rightmost_idx = -1   # index into deduped of the entity that set rightmost_end

        for entity in combined:
            if entity["start"] >= rightmost_end:
                # No overlap — always keep
                deduped.append(entity)
                if entity["end"] > rightmost_end:
                    rightmost_end = entity["end"]
                    rightmost_idx = len(deduped) - 1
            else:
                # Overlap with a previous entity
                # Check if this entity is strictly higher confidence
                overlapping = deduped[rightmost_idx]
                if entity["score"] > overlapping["score"] + 0.05:
                    # Replace the lower-confidence entity
                    deduped[rightmost_idx] = entity
                    # Update rightmost_end if needed
                    rightmost_end = max(rightmost_end, entity["end"])
                # Otherwise discard the new entity — existing one wins

        return sorted(deduped, key=lambda x: x["start"])


# ── Language Detector ─────────────────────────────────────────────────────────

class LanguageDetector:
    def detect(self, text: str) -> dict:
        info = detect_script(text)
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
            return ["hindi_regex","hindi_presidio","spacy_hi"]
        elif mode == "mixed":
            return ["regex","presidio","spacy","hindi_regex","hindi_presidio","spacy_hi"]
        else:
            return ["regex","presidio","spacy"]


# ── Hindi Pipeline Orchestrator ───────────────────────────────────────────────

class HindiPipeline:
    def __init__(self):
        self.ready    = False
        self._nlp_hi: Optional[spacy.Language] = None
        self._presidio: Optional[HindiPresidioStage] = None
        self._regex   = HindiRegexStage()
        self._spacy:  Optional[SpacyHindiNERStage] = None
        self._load()

    def _load(self):
        for model_name in ["hi_core_news_md", "hi_core_news_sm"]:
            try:
                nlp      = spacy.load(model_name)
                disabled = [p for p in ["parser","lemmatizer","morphologizer"]
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
                "No Hindi spaCy model found. "
                "Install: python -m spacy download hi_core_news_sm"
            )

        hindi_model = "hi_core_news_sm" if self._nlp_hi else "en_core_web_sm"
        try:
            engine         = build_hindi_presidio_engine(hindi_model)
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
        text:           str,
        threshold:      float = CONFIDENCE_THRESHOLD_HI,
        language_hint:  str   = "auto",
    ) -> list[HindiEntity]:
        if not text.strip():
            return []

        if language_hint == "auto":
            info          = detect_script(text)
            language_hint = info["mode"]

        norm = normalise_devanagari_digits(text)
        all_candidates: list[HindiEntity] = []

        # Stage 1: Hindi regex (always runs)
        all_candidates.extend(self._regex.analyse(text))

        # Stage 2: Presidio
        # For mixed documents, run in English mode so Presidio can also
        # catch Latin-script PII in the same pass.
        if self._presidio:
            lang = "hi" if language_hint == "hindi" else "en"
            all_candidates.extend(self._presidio.analyse(norm, language=lang))

        # Stage 3: spaCy Hindi NER — only for documents with Devanagari
        # The segment-aware stage handles isolation internally.
        if self._spacy and language_hint in ("hindi", "mixed"):
            all_candidates.extend(self._spacy.analyse(text))

        all_candidates = apply_hindi_context_scoring(all_candidates, text)
        merged         = merge_hindi_entities(all_candidates)

        result = sorted(
            [e for e in merged if e.score >= threshold],
            key=lambda e: e.start,
        )
        logger.info(
            "HindiPipeline [%s]: %d raw → %d entities",
            language_hint, len(all_candidates), len(result),
        )
        return result


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
    if not hindi_pipeline.ready:
        raise HTTPException(503, "Hindi pipeline not ready")

    entities  = hindi_pipeline.run(
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
    if not hindi_pipeline.ready:
        raise HTTPException(503, "Hindi pipeline not ready")

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

    # Merge — fixed dedup logic
    merged    = mixed_handler.merge_english_and_hindi(en_entities, hi_entities)
    lang_info = language_detector.detect(request.text)

    type_counts: dict[str, int] = {}
    lang_counts: dict[str, int] = {}
    for e in merged:
        type_counts[e["entity_type"]]       = type_counts.get(e["entity_type"], 0) + 1
        lang_counts[e.get("language","en")] = lang_counts.get(e.get("language","en"), 0) + 1

    return {
        "entity_count":  len(merged),
        "entities":      merged,
        "language_info": lang_info,
        "stats": {
            "by_type":       type_counts,
            "by_language":   lang_counts,
            "english_found": len(en_entities),
            "hindi_found":   len(hi_entities),
            "text_length":   len(request.text),
        },
    }