from app.core.celery_app import celery
from app.core.database import SessionLocal
from app.models.document import Document, JobStatus, RedactionJob
from app.schemas.document import RedactionEntity
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import VerificationEngine
from app.services.storage import StorageService
import uuid
import os

@celery.task(bind=True, name="app.tasks.redaction_tasks.process_redaction")
def process_redaction(self, job_id: str):
    db = SessionLocal()
    try:
        job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
        if not job:
            return {"error": "Job not found"}
            
        job.status = JobStatus.PROCESSING
        db.commit()
        
        doc = job.document
        
        # Load file using Cloud Storage Abstraction
        try:
            file_bytes = StorageService.get_document(doc.storage_key)
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = VerificationEngine.sanitize_error_string(f"Failed to retrieve file: {str(e)}")
            db.commit()
            return {"error": job.error_message}
            
        # Reconstruct entities
        entities = []
        if doc.detected_entities:
            for ent_data in doc.detected_entities:
                entities.append(RedactionEntity(**ent_data))
                
        # Run Redaction
        redacted_bytes = SecureRedactionEngine.redact_document(file_bytes, doc.filename, entities)
        
        # Phase 7: Verification
        VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{doc.filename}", entities)
        
        # Save redacted file using Cloud Storage Abstraction
        redacted_storage_key = StorageService.save_document(redacted_bytes, f"redacted_{doc.filename}", directory="redacted")
            
        job.status = JobStatus.COMPLETED
        job.error_message = redacted_storage_key
        db.commit()
        
        return {"status": "success", "result_path": redacted_storage_key}
        
    except Exception as e:
        job.status = JobStatus.FAILED
        err_msg = getattr(e, "detail", str(e))
        job.error_message = VerificationEngine.sanitize_error_string(str(err_msg))
        db.commit()
        return {"error": job.error_message}
    finally:
        db.close()
