from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session as DBSession
import uuid

from app.core.database import get_db
from app.models.identity import User
from app.models.document import Document, JobStatus, SafetyStatus
from app.api.auth import get_current_user
from app.services.document_parser import DocumentParser

router = APIRouter(prefix="/api/v3/documents", tags=["Documents"])

@router.post("/upload")
async def upload_document(
    org_id: str,
    file: UploadFile = File(...), 
    db: DBSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # Read file
    file_bytes = await file.read()
    
    # Save file to local storage
    import os
    os.makedirs("data/uploads", exist_ok=True)
    storage_key = f"data/uploads/{uuid.uuid4()}_{file.filename}"
    with open(storage_key, "wb") as f:
        f.write(file_bytes)
    
    # Process through Phase 2 Canonical Engine
    canonical_doc = DocumentParser.parse(file_bytes, file.filename)
    
    # Process through Phase 4 Detection Engine
    from app.services.detection_engine import DetectionEngine
    raw_entities = DetectionEngine.run_detection(canonical_doc)
    
    # Process through Phase 5 Decision Engine
    from app.services.decision_engine import DecisionEngine
    # In a real app we fetch org.policy_config. Using default standard policy.
    entities = DecisionEngine.apply_policies(raw_entities, policy_config={"mode": "standard"})
    
    # Save to database
    db_doc = Document(
        id=str(uuid.uuid4()),
        org_id=org_id,
        uploaded_by=current_user.id,
        filename=file.filename,
        file_type=file.content_type,
        storage_key=storage_key,
        status=JobStatus.COMPLETED,
        safety_status=SafetyStatus.UNVERIFIED,
        canonical_representation=canonical_doc.model_dump(),
        detected_entities=[e.model_dump() for e in entities]
    )
    
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    
    return {
        "message": "Document parsed successfully",
        "document_id": db_doc.id,
        "metadata": canonical_doc.metadata,
        "page_count": canonical_doc.page_count
    }

@router.get("/{document_id}/canonical")
def get_canonical_document(
    document_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return doc.canonical_representation
@router.get("/{document_id}/entities")
def get_detected_entities(
    document_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return {"entities": doc.detected_entities or []}
from fastapi.responses import StreamingResponse
from app.schemas.document import RedactionEntity
import io

@router.post("/{document_id}/redact")
def redact_document(
    document_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if not doc.storage_key:
        raise HTTPException(status_code=400, detail="Document file not found on server")
        
    try:
        with open(doc.storage_key, "rb") as f:
            file_bytes = f.read()
    except Exception:
        raise HTTPException(status_code=500, detail="Could not read original file")
        
    # Reconstruct RedactionEntity objects from the DB JSON
    entities = []
    if doc.detected_entities:
        for ent_data in doc.detected_entities:
            entities.append(RedactionEntity(**ent_data))
            
    from app.services.redaction_engine import SecureRedactionEngine
    from app.services.verification_engine import VerificationEngine
    
    redacted_bytes = SecureRedactionEngine.redact_document(file_bytes, doc.filename, entities)
    
    # Phase 7: Verification Engine (Zero-Trust)
    # Ensure no sensitive data leaked into the redacted bytes
    VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{doc.filename}")
    
    # Return as downloadable file
    return StreamingResponse(
        io.BytesIO(redacted_bytes),
        media_type=doc.file_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename=redacted_{doc.filename}"}
    )
from typing import List

@router.put("/{document_id}/entities")
def update_detected_entities(
    document_id: str,
    updated_entities: List[RedactionEntity],
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Replace the stored entities with the updated list from human review
    doc.detected_entities = [e.model_dump() for e in updated_entities]
    db.commit()
    
    return {"message": "Entities updated successfully", "entity_count": len(updated_entities)}
from app.models.document import RedactionJob, JobStatus
from app.tasks.redaction_tasks import process_redaction

@router.post("/{document_id}/redact/async")
def redact_document_async(
    document_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Create job record
    job = RedactionJob(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        status=JobStatus.QUEUED
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Enqueue celery task
    process_redaction.delay(job.id)
    
    return {"message": "Redaction job queued", "job_id": job.id}

@router.get("/redact/jobs/{job_id}")
def get_redaction_job_status(
    job_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job.id,
        "status": job.status,
        "error_message": job.error_message
    }

from fastapi.responses import FileResponse
import os

@router.get("/redact/jobs/{job_id}/download")
def download_redacted_job(
    job_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed")
        
    if not job.error_message or not os.path.exists(job.error_message):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(
        path=job.error_message,
        filename=f"redacted_{job.document.filename}" if job.document else "redacted.pdf"
    )
