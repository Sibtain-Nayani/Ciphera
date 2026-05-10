"""
Ciphera V3 — main.py (complete, all 11 features mounted)
"""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from feature1_pipeline_upgrade import DetectionPipeline, AnalyzeRequest, AnalyzeResponse, EntityResponse
from feature2_pdf_multipage    import router as pdf_router,       set_pipeline as pdf_set_pipeline
from feature6_image_redaction  import router as image_router
from feature7_ml_scoring       import router as scoring_router
from feature8_api_keys         import api_router, public_router
from feature9_synthetic        import router as synthetic_router
from feature10_audit_db        import router as audit_router
from feature11_doc_classifier  import router as classifier_router

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
    title="Ciphera V3 — Intelligent PII Anonymization API",
    description="""
## Ciphera V3

Enterprise-grade PII detection and anonymization for Indian and global documents.

### Authentication
Public API endpoints require an API key in the `X-API-Key` header.
Obtain a key from Settings → Engine Config → API Keys.

### Capabilities
- Multi-layer detection: Regex → Presidio → spaCy NLP → Voting ensemble
- Indian PII: Aadhaar, PAN, GSTIN, IFSC, Voter ID, Passport, Vehicle Reg
- Global PII: Email, Phone, Credit Card, SSN, Dates, URLs, IPs
- Contextual ML scoring via Groq (llama-3.1-8b-instant)
- Synthetic data substitution with realistic Indian PII
- Face detection and blurring in images
- Document type auto-classification
- Persistent SQLite audit trail
    """,
    version="3.4.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# All feature routers
app.include_router(pdf_router)
app.include_router(image_router)
app.include_router(scoring_router)
app.include_router(api_router)
app.include_router(public_router)
app.include_router(synthetic_router)
app.include_router(audit_router)
app.include_router(classifier_router)


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
        "version":   "3.4.0",
        "features": [
            "detection-pipeline-v3",
            "pdf-multipage",
            "image-redaction",
            "ml-scoring-groq",
            "api-keys",
            "synthetic-substitution",
            "audit-db",
            "doc-classifier",
        ],
        "endpoints": [
            "POST /api/v3/analyze",
            "POST /api/v3/analyze-pdf",
            "POST /api/v3/redact-image",
            "POST /api/v3/score-entities",
            "POST /api/v3/synthesize",
            "POST /api/v3/classify",
            "POST /api/v3/public/redact",
            "POST /api/v3/public/analyze",
            "POST /api/v3/audit/log",
            "GET  /api/v3/audit/logs",
            "GET  /api/v3/audit/stats",
        ],
    }


@app.get("/api/v3/entities")
async def list_entity_types():
    return {"entity_types": [
        "PERSON","EMAIL_ADDRESS","PHONE_NUMBER","AADHAAR_NUMBER","PAN_NUMBER",
        "GST_NUMBER","IFSC_CODE","VOTER_ID","IN_PASSPORT","IN_VEHICLE_REG",
        "CREDIT_CARD","DATE_TIME","DATE_OF_BIRTH","LOCATION","ORGANIZATION",
        "URL","IP_ADDRESS",
    ]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)