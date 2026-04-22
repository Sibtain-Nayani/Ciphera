"""
Ciphera V3 — Feature 7 (v2): Context-Aware ML Scoring via Groq
===============================================================
Uses Groq (free tier, very fast) instead of Anthropic.
Models available on Groq free tier:
  - llama-3.1-8b-instant   (fastest, good enough for scoring)
  - llama-3.3-70b-versatile (more accurate, still free)
  - mixtral-8x7b-32768     (good context window)

Get your free key at: https://console.groq.com
It's completely free with generous rate limits.

Setup:
    pip install groq
    $env:GROQ_API_KEY = "gsk_YOUR_KEY_HERE"

Mount in main.py:
    from feature7_ml_scoring import router as scoring_router
    app.include_router(scoring_router)
"""

from __future__ import annotations

import os
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("ciphera.ml_scoring")
router = APIRouter()

# Default model — fast and free
DEFAULT_MODEL = "llama-3.1-8b-instant"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class EntityToScore(BaseModel):
    entity_type: str
    text:        str
    context:     str
    start:       int
    end:         int
    score:       float
    source:      str


class ScoringRequest(BaseModel):
    entities:      list[EntityToScore]
    document_text: str = Field(..., max_length=50_000)
    document_type: str = Field("unknown")
    threshold:     float = Field(0.45, ge=0.0, le=1.0)
    model:         str   = Field(DEFAULT_MODEL)


class ScoredEntity(BaseModel):
    entity_type:       str
    text:              str
    context:           str
    start:             int
    end:               int
    pipeline_score:    float
    sensitivity_score: float
    final_score:       float
    reasoning:         str
    should_redact:     bool


class ScoringResponse(BaseModel):
    entities_in:   int
    entities_out:  int
    entities:      list[ScoredEntity]
    document_type: str
    model_used:    str


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

DOCUMENT_TYPE_HINTS = {
    "kyc":       "KYC / identity verification form. Almost all personal fields are highly sensitive.",
    "invoice":   "Financial invoice. GST, bank details, amounts = sensitive. Company name, date = not.",
    "resume":    "Resume/CV. Contact info is intentionally shared. Past employers and dates are not confidential.",
    "medical":   "Medical record. ALL patient data, diagnoses, medications = extremely sensitive.",
    "legal":     "Legal document. Party names, case numbers, financial amounts = sensitive.",
    "financial": "Bank / financial statement. Account numbers, balances, transactions = sensitive.",
    "unknown":   "Infer document type from context and score accordingly.",
}


def build_prompt(entities: list[EntityToScore], doc_text: str, doc_type: str) -> str:
    hint    = DOCUMENT_TYPE_HINTS.get(doc_type, DOCUMENT_TYPE_HINTS["unknown"])
    preview = doc_text[:1500] + ("…" if len(doc_text) > 1500 else "")
    items   = "\n".join(
        f'{i+1}. TYPE={e.entity_type} VALUE="{e.text}" CONTEXT="{e.context}"'
        for i, e in enumerate(entities)
    )
    return f"""You are a data privacy expert. Score whether each detected entity should be redacted.

DOCUMENT TYPE: {hint}

DOCUMENT (first 1500 chars):
---
{preview}
---

ENTITIES:
{items}

Respond ONLY with a JSON array (no markdown, no extra text):
[{{"index":1,"sensitivity_score":0.9,"reasoning":"one sentence"}},...]

Score guide: 1.0=must redact (Aadhaar/PAN/SSN/DOB/CC/medical), 0.7=likely sensitive, 0.5=context-dependent, 0.2=probably public, 0.0=definitely not sensitive"""


# ---------------------------------------------------------------------------
# Groq client
# ---------------------------------------------------------------------------

def get_groq_client():
    try:
        from groq import Groq
    except ImportError:
        raise HTTPException(503, "groq package not installed. Run: pip install groq")

    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(503, "GROQ_API_KEY not set. Get a free key at console.groq.com")

    return Groq(api_key=key)


def score_batch_groq(
    client,
    entities:  list[EntityToScore],
    doc_text:  str,
    doc_type:  str,
    model:     str,
) -> list[dict]:
    prompt = build_prompt(entities, doc_text, doc_type)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=512,
            temperature=0.1,   # low temp for consistent scoring
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown fences
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]

        # Find the JSON array
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        if start != -1 and end > start:
            raw = raw[start:end]

        return json.loads(raw)

    except json.JSONDecodeError as e:
        logger.error("Groq returned invalid JSON: %s", e)
        return [{"index": i+1, "sensitivity_score": 0.6, "reasoning": "parse error"} for i in range(len(entities))]
    except Exception as e:
        logger.error("Groq API error: %s", e)
        return [{"index": i+1, "sensitivity_score": 0.6, "reasoning": f"api error: {e}"} for i in range(len(entities))]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

BATCH_SIZE = 12


@router.post("/api/v3/score-entities", response_model=ScoringResponse)
async def score_entities(request: ScoringRequest):
    if not request.entities:
        return ScoringResponse(entities_in=0, entities_out=0, entities=[],
                               document_type=request.document_type, model_used="none")

    client = get_groq_client()
    model  = request.model or DEFAULT_MODEL

    all_scores: list[dict] = []
    for i in range(0, len(request.entities), BATCH_SIZE):
        batch  = request.entities[i:i + BATCH_SIZE]
        result = score_batch_groq(client, batch, request.document_text, request.document_type, model)
        for item in result:
            item["global_index"] = i + item.get("index", 1) - 1
        all_scores.extend(result)

    score_map = {item.get("global_index", idx): item for idx, item in enumerate(all_scores)}

    output: list[ScoredEntity] = []
    for idx, entity in enumerate(request.entities):
        ml   = score_map.get(idx, {})
        sens = float(ml.get("sensitivity_score", 0.6))
        # 35% pipeline + 65% ML context score
        final = round(0.35 * entity.score + 0.65 * sens, 4)
        output.append(ScoredEntity(
            entity_type=entity.entity_type, text=entity.text,
            context=entity.context, start=entity.start, end=entity.end,
            pipeline_score=entity.score, sensitivity_score=sens,
            final_score=final, reasoning=ml.get("reasoning", ""),
            should_redact=(final >= request.threshold),
        ))

    filtered = [e for e in output if e.should_redact]
    logger.info("ML scoring: %d in → %d out (threshold=%.2f)", len(request.entities), len(filtered), request.threshold)

    return ScoringResponse(
        entities_in=len(request.entities), entities_out=len(filtered),
        entities=output, document_type=request.document_type, model_used=model,
    )


@router.get("/api/v3/score-entities/health")
async def scoring_health():
    groq_key = bool(os.getenv("GROQ_API_KEY"))
    return {
        "available":    groq_key,
        "provider":     "Groq (free)",
        "model":        DEFAULT_MODEL,
        "key_set":      groq_key,
        "message":      "ML scoring ready" if groq_key else "Get a free key at console.groq.com and set GROQ_API_KEY",
        "get_key_url":  "https://console.groq.com",
    }