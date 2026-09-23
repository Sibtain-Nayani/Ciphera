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
    
    # Process through Phase 2 Canonical Engine
    canonical_doc = DocumentParser.parse(file_bytes, file.filename)
    
    # Save to database
    db_doc = Document(
        id=str(uuid.uuid4()),
        org_id=org_id,
        uploaded_by=current_user.id,
        filename=file.filename,
        file_type=file.content_type,
        status=JobStatus.COMPLETED,
        safety_status=SafetyStatus.UNVERIFIED,
        canonical_representation=canonical_doc.model_dump()
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
