"""
Ciphera V3 — main.py (updated)
================================
Changes:
  - Includes feature7_ml_scoring router
  - Face detection minimum area filter (fixes false positives on document patterns)
  - /api/v3/redact-image now rejects detections smaller than 0.3% of image area
"""

from contextlib import asynccontextmanager
from typing import Optional
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from feature1_pipeline_upgrade import (
    DetectionPipeline, AnalyzeRequest, AnalyzeResponse, EntityResponse,
)
from feature2_pdf_multipage   import router as pdf_router,     set_pipeline as pdf_set_pipeline
from feature6_image_redaction import router as image_router
from feature7_ml_scoring      import router as scoring_router

import feature1_pipeline_upgrade as f1

pipeline: Optional[DetectionPipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    pipeline = DetectionPipeline(use_transformer=True)
    pdf_set_pipeline(pipeline)
    f1.pipeline = pipeline
    yield


app = FastAPI(
    title="Ciphera V3 — Detection API",
    version="3.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

app.include_router(pdf_router)
app.include_router(image_router)
app.include_router(scoring_router)


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
    return {
        "status":  "ok" if pipeline else "loading",
        "version": "3.3.0",
        "endpoints": [
            "POST /api/v3/analyze",
            "POST /api/v3/analyze-pdf",
            "POST /api/v3/redact-image",
            "POST /api/v3/score-entities",
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