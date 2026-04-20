"""
Ciphera V3 — Master main.py
============================
Wires all 6 feature modules into a single FastAPI app.

Folder structure expected:
  v3/backend/
    main.py                      ← this file
    feature1_pipeline_upgrade.py
    feature2_pdf_multipage.py
    feature6_image_redaction.py
    models/ciphera_ner/          ← created after running feature3_train_ner.py

Install everything:
    pip install fastapi uvicorn presidio-analyzer presidio-anonymizer spacy
    pip install pymupdf opencv-python-headless pillow numpy python-multipart
    python -m spacy download en_core_web_trf
    (optional, for training) pip install faker

Run:
    uvicorn main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Feature imports ──────────────────────────────────────────────────────────
from feature1_pipeline_upgrade import (
    DetectionPipeline,
    AnalyzeRequest,
    AnalyzeResponse,
    EntityResponse,
)
from feature2_pdf_multipage   import router as pdf_router,   set_pipeline as pdf_set_pipeline
from feature6_image_redaction import router as image_router

import feature1_pipeline_upgrade as f1

# ── Lifespan: load heavy models once ─────────────────────────────────────────

pipeline: Optional[DetectionPipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline

    # Load pipeline (tries en_core_web_trf, falls back to en_core_web_lg)
    pipeline = DetectionPipeline(use_transformer=True)

    # Share pipeline with PDF module
    pdf_set_pipeline(pipeline)

    # Patch the analyze endpoint's dependency
    f1.pipeline = pipeline

    yield
    # cleanup if needed


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Ciphera V3 — Detection API",
    description=(
        "Multi-layer PII detection pipeline\n\n"
        "Endpoints:\n"
        "- POST /api/v3/analyze         — text analysis\n"
        "- POST /api/v3/analyze-pdf     — multi-page PDF\n"
        "- POST /api/v3/redact-image    — face redaction\n"
        "- GET  /api/v3/health          — status\n"
        "- GET  /api/v3/entities        — entity type list"
    ),
    version="3.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount feature routers
app.include_router(pdf_router)
app.include_router(image_router)


# ── Core text analysis endpoint ───────────────────────────────────────────────

from fastapi import HTTPException

@app.post("/api/v3/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    if pipeline is None:
        raise HTTPException(503, "Pipeline not ready")
    entities = pipeline.run(
        request.text,
        request.threshold,
        request.enabled_stages,
        request.clean_ocr,
    )
    dicts = [e.to_dict() for e in entities]
    if not request.include_context:
        for d in dicts:
            d["context"] = ""
    type_counts:   dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for e in entities:
        type_counts[e.entity_type]    = type_counts.get(e.entity_type, 0) + 1
        source_counts[e.source.value] = source_counts.get(e.source.value, 0) + 1
    return AnalyzeResponse(
        entity_count=len(entities),
        entities=[EntityResponse(**d) for d in dicts],
        stats={
            "by_type":   type_counts,
            "by_source": source_counts,
            "text_length": len(request.text),
        },
    )


@app.get("/api/v3/health")
async def health():
    return {
        "status":    "ok" if pipeline else "loading",
        "version":   "3.2.0",
        "endpoints": [
            "POST /api/v3/analyze",
            "POST /api/v3/analyze-pdf",
            "POST /api/v3/redact-image",
            "POST /api/v3/redact-image/download",
        ],
    }


@app.get("/api/v3/entities")
async def list_entity_types():
    return {"entity_types": [
        "PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER",
        "AADHAAR_NUMBER", "PAN_NUMBER", "GST_NUMBER",
        "IFSC_CODE", "VOTER_ID", "IN_PASSPORT", "IN_VEHICLE_REG",
        "CREDIT_CARD", "DATE_TIME", "DATE_OF_BIRTH",
        "LOCATION", "ORGANIZATION", "URL", "IP_ADDRESS",
    ]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)