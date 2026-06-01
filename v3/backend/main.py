"""
Ciphera V3.3 — main.py
Auth + Orgs + RBAC + upgraded API keys
"""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from feature1_pipeline_upgrade import (
    DetectionPipeline, AnalyzeRequest, AnalyzeResponse, EntityResponse
)
import feature1_pipeline_upgrade as f1

from feature2_pdf_multipage     import router as pdf_router,      set_pipeline as pdf_set_pipeline
from feature6_image_redaction   import router as image_router
from feature7_ml_scoring        import router as scoring_router
from feature8_api_keys          import api_router, public_router  # upgraded
from feature9_synthetic         import router as synthetic_router
from feature10_audit_db         import router as audit_router
from feature11_doc_classifier   import router as classifier_router
from feature12_hindi_support    import router as hindi_router
from feature13_ocr_hindi        import router as ocr_hindi_router
from feature14_audit_report     import router as report_router
from feature15_auth             import router as auth_router       # NEW
from feature16_organisations    import router as org_router        # NEW

pipeline: Optional[DetectionPipeline] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    pipeline = DetectionPipeline(use_transformer=True)
    pdf_set_pipeline(pipeline)
    f1.pipeline = pipeline
    yield


app = FastAPI(
    title="Ciphera V3.3 — Intelligent PII Anonymization API",
    version="3.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Ciphera-Report-ID", "X-Ciphera-Content-Hash"],
)

# ── All routers ───────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(org_router)
app.include_router(pdf_router)
app.include_router(image_router)
app.include_router(scoring_router)
app.include_router(api_router)
app.include_router(public_router)
app.include_router(synthetic_router)
app.include_router(audit_router)
app.include_router(classifier_router)
app.include_router(hindi_router)
app.include_router(ocr_hindi_router)
app.include_router(report_router)


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
        stats={"by_type": type_counts, "by_source": source_counts, "text_length": len(request.text)},
    )


@app.get("/api/v3/health")
async def health():
    from feature12_hindi_support import hindi_pipeline
    from feature13_ocr_hindi     import ocr_processor
    return {
        "status":  "ok" if pipeline else "loading",
        "version": "3.3.0",
        "features": {
            "auth":               True,
            "organisations":      True,
            "rbac":               True,
            "english_pipeline":   bool(pipeline),
            "hindi_pipeline":     hindi_pipeline.ready,
            "ocr_hindi":          ocr_processor.hindi_available,
            "pdf_burnin":         True,
            "dnn_face_detection": True,
            "signed_audit_report":True,
            "api_key_auth":       True,
        },
    }


@app.get("/api/v3/entities")
async def list_entity_types():
    return {"entity_types": [
        "PERSON","EMAIL_ADDRESS","PHONE_NUMBER","AADHAAR_NUMBER","PAN_NUMBER",
        "GST_NUMBER","IFSC_CODE","VOTER_ID","IN_PASSPORT","IN_VEHICLE_REG",
        "CREDIT_CARD","DATE_TIME","DATE_OF_BIRTH","LOCATION","ORGANIZATION",
        "URL","IP_ADDRESS","UPI_ID","BANK_ACCOUNT","DRIVING_LICENCE","PIN_CODE",
    ]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)