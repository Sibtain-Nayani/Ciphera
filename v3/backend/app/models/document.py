import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    REVIEW_REQUIRED = "review_required"

class SafetyStatus(str, enum.Enum):
    UNVERIFIED = "unverified"
    VERIFIED = "verified"
    VERIFICATION_FAILED = "verification_failed"

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    org_id = Column(String, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    uploaded_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    filename = Column(String, nullable=False)
    file_type = Column(String)  # e.g., application/pdf, text/plain
    storage_key = Column(String) # Object storage path/URI
    
    status = Column(SQLEnum(JobStatus), default=JobStatus.QUEUED)
    safety_status = Column(SQLEnum(SafetyStatus), default=SafetyStatus.UNVERIFIED)
    
    # Simple JSON representation of the "Canonical Document" for now
    canonical_representation = Column(JSON, nullable=True) 
    detected_entities = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
class RedactionJob(Base):
    __tablename__ = "redaction_jobs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    document_id = Column(String, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    status = Column(SQLEnum(JobStatus), default=JobStatus.QUEUED)
    
    # Store settings for the job (e.g. risk mode, target entities)
    policy_config = Column(JSON, nullable=True)
    result_storage_key = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(String, nullable=True)

    document = relationship("Document")
