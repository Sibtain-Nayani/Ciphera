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
