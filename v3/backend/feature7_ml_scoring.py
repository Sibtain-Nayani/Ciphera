"""
Ciphera V3 — Feature 7: Context-Aware ML Sensitivity Scoring
=============================================================
Uses Claude (via Anthropic API) to score whether each detected entity
is ACTUALLY sensitive given the full document context.

This solves the false-positive problem: e.g. a date like "15 March 2024"
in a news article is NOT sensitive, but the same date as a Date of Birth
in a KYC form IS sensitive.

Endpoint:  POST /api/v3/score-entities

Flow:
  1. Frontend sends detected entities + surrounding document text
  2. We batch entities into groups of 10 (to keep token count low)
  3. Each batch is sent to Claude with the document context
  4. Claude returns a sensitivity score (0.0–1.0) + reasoning for each
  5. We filter out entities below the sensitivity threshold
  6. Frontend uses the filtered list for redaction

Install:
    pip install anthropic

Add to main.py:
    from feature7_ml_scoring import router as scoring_router
    app.include_router(scoring_router)

IMPORTANT: Set your Anthropic API key as an environment variable:
    set ANTHROPIC_API_KEY=sk-ant-...
    (Windows) or export ANTHROPIC_API_KEY=... (Linux/Mac)
"""

from __future__ import annotations

import os
import json
import logging
from typing import Optional

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("ciphera.ml_scoring")
router = APIRouter()

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class EntityToScore(BaseModel):
    entity_type: str
    text:        str
    context:     str          # ±60 chars around entity
    start:       int
    end:         int
    score:       float        # pipeline confidence (0–1)
    source:      str


class ScoringRequest(BaseModel):
    entities:      list[EntityToScore]
    document_text: str = Field(..., max_length=50_000)
    document_type: str = Field("unknown")  # "kyc", "invoice", "resume", "medical", etc.
    threshold:     float = Field(0.45, ge=0.0, le=1.0)


class ScoredEntity(BaseModel):
    entity_type:       str
    text:              str
    context:           str
    start:             int
    end:               int
    pipeline_score:    float   # original detection confidence
    sensitivity_score: float   # ML contextual score (0–1)
    final_score:       float   # combined
    reasoning:         str     # Claude's brief explanation
    should_redact:     bool


class ScoringResponse(BaseModel):
    entities_in:   int
    entities_out:  int          # after filtering
    entities:      list[ScoredEntity]
    document_type: str
    model_used:    str


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

DOCUMENT_TYPE_HINTS = {
    "kyc":      "This is a KYC (Know Your Customer) form. Almost all personal fields are sensitive.",
    "invoice":  "This is a financial invoice. Amounts, GST numbers, and bank details are sensitive. Dates and company names usually are not.",
    "resume":   "This is a resume/CV. Name, email, phone, address, and skills are typically shared intentionally. Past employers and dates are not usually confidential.",
    "medical":  "This is a medical document. All patient details, diagnoses, medications, and dates of birth are highly sensitive.",
    "legal":    "This is a legal document. Party names, case numbers, and financial amounts are sensitive.",
    "unknown":  "Infer the document type from context and score accordingly.",
}


def build_scoring_prompt(
    entities:      list[EntityToScore],
    document_text: str,
    document_type: str,
) -> str:
    doc_hint = DOCUMENT_TYPE_HINTS.get(document_type, DOCUMENT_TYPE_HINTS["unknown"])
    doc_preview = document_text[:2000] + ("…" if len(document_text) > 2000 else "")

    entity_list = "\n".join([
        f'{i+1}. TYPE={e.entity_type} VALUE="{e.text}" CONTEXT="{e.context}"'
        for i, e in enumerate(entities)
    ])

    return f"""You are a privacy and data protection expert. Your job is to determine whether each detected text entity is genuinely sensitive/private/confidential and SHOULD be redacted before sharing this document.

DOCUMENT TYPE HINT: {doc_hint}

DOCUMENT PREVIEW (first 2000 chars):
---
{doc_preview}
---

DETECTED ENTITIES TO EVALUATE:
{entity_list}

For each entity, respond with a JSON array. Each element must have:
- "index": the entity number (1-based)
- "sensitivity_score": float 0.0 to 1.0 (0=not sensitive, 1=highly sensitive)
- "reasoning": one sentence explaining why

Scoring guide:
- 1.0: Highly sensitive PII that must always be redacted (Aadhaar, PAN, SSN, passport number, DOB in identity doc, credit card, bank account, medical diagnosis)
- 0.8: Very likely sensitive given context (full name in KYC, phone number in personal doc, email in private correspondence)
- 0.6: Likely sensitive depending on context (dates in KYC = sensitive, dates in news = not)
- 0.4: Possibly sensitive (company name, general address, public email)
- 0.2: Probably not sensitive (publicly known info, document metadata)
- 0.0: Definitely not sensitive (column headers, generic labels, public data)

Respond ONLY with a valid JSON array, no markdown, no explanation outside the array:
[{{"index": 1, "sensitivity_score": 0.9, "reasoning": "..."}}, ...]"""


# ---------------------------------------------------------------------------
# Claude API caller
# ---------------------------------------------------------------------------

def get_anthropic_client() -> anthropic.Anthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            503,
            "ANTHROPIC_API_KEY not set. Add it to your environment variables."
        )
    return anthropic.Anthropic(api_key=api_key)


async def score_batch(
    client:        anthropic.Anthropic,
    entities:      list[EntityToScore],
    document_text: str,
    document_type: str,
) -> list[dict]:
    """Score a batch of up to 15 entities."""
    prompt = build_scoring_prompt(entities, document_text, document_type)

    try:
        message = client.messages.create(
            model="claude-3-5-haiku-20241022",   # Fast + cheap for scoring
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        scores = json.loads(raw)
        return scores

    except json.JSONDecodeError as e:
        logger.error("Claude returned invalid JSON: %s", e)
        # Return neutral scores on parse failure — don't block the pipeline
        return [{"index": i+1, "sensitivity_score": 0.6, "reasoning": "scoring unavailable"} for i in range(len(entities))]
    except Exception as e:
        logger.error("Claude API error: %s", e)
        return [{"index": i+1, "sensitivity_score": 0.6, "reasoning": "API error"} for i in range(len(entities))]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

BATCH_SIZE = 15   # entities per Claude call (keeps tokens manageable)


@router.post("/api/v3/score-entities", response_model=ScoringResponse)
async def score_entities(request: ScoringRequest):
    """
    Takes a list of detected entities and scores each one for contextual
    sensitivity using Claude. Returns filtered list of entities that should
    actually be redacted.
    """
    if not request.entities:
        return ScoringResponse(
            entities_in=0, entities_out=0, entities=[],
            document_type=request.document_type, model_used="none",
        )

    client = get_anthropic_client()

    # Batch processing
    all_scores: list[dict] = []
    for i in range(0, len(request.entities), BATCH_SIZE):
        batch  = request.entities[i:i + BATCH_SIZE]
        result = await score_batch(client, batch, request.document_text, request.document_type)
        # Re-index to global
        for item in result:
            item["global_index"] = i + item["index"] - 1
        all_scores.extend(result)

    # Build a lookup by global index
    score_map = {item.get("global_index", item.get("index", 0) - 1): item for item in all_scores}

    # Combine pipeline score + ML score
    output: list[ScoredEntity] = []
    for idx, entity in enumerate(request.entities):
        ml_data = score_map.get(idx, {})
        sens    = float(ml_data.get("sensitivity_score", 0.6))
        reason  = ml_data.get("reasoning", "")

        # Weighted combination: 40% pipeline confidence + 60% ML sensitivity
        final = round(0.4 * entity.score + 0.6 * sens, 4)

        output.append(ScoredEntity(
            entity_type=entity.entity_type,
            text=entity.text,
            context=entity.context,
            start=entity.start,
            end=entity.end,
            pipeline_score=entity.score,
            sensitivity_score=sens,
            final_score=final,
            reasoning=reason,
            should_redact=(final >= request.threshold),
        ))

    filtered = [e for e in output if e.should_redact]

    logger.info(
        "ML scoring: %d in → %d out (threshold=%.2f)",
        len(request.entities), len(filtered), request.threshold,
    )

    return ScoringResponse(
        entities_in=len(request.entities),
        entities_out=len(filtered),
        entities=output,          # return ALL with scores, frontend filters by should_redact
        document_type=request.document_type,
        model_used="claude-3-5-haiku-20241022",
    )


@router.get("/api/v3/score-entities/health")
async def scoring_health():
    key_set = bool(os.getenv("ANTHROPIC_API_KEY"))
    return {
        "available":  key_set,
        "model":      "claude-3-5-haiku-20241022",
        "key_set":    key_set,
        "message":    "ML scoring ready" if key_set else "Set ANTHROPIC_API_KEY to enable ML scoring",
    }
