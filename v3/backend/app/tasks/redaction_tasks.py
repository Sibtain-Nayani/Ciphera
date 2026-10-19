from app.core.celery_app import celery
from app.core.database import SessionLocal
from app.models.document import Document, JobStatus, SafetyStatus, RedactionJob
from app.schemas.document import RedactionEntity
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import VerificationEngine, VerificationUncertainty, VerificationFailure
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
        # Cleanup any old/stale artifact if this is a retry or re-run
        if job.result_storage_key:
            try:
                StorageService.delete_document(job.result_storage_key)
            except Exception:
                pass
            job.result_storage_key = None
        job.error_message = None
        db.commit()
        
        doc = job.document
        
        # Load file using Cloud Storage Abstraction
        try:
            file_bytes = StorageService.get_document(doc.storage_key)
        except Exception as e:
            job.status = JobStatus.FAILED
            job.result_storage_key = None
            job.error_message = VerificationEngine.sanitize_error_string(f"Failed to retrieve file: {str(e)}")
            if doc:
                doc.safety_status = SafetyStatus.VERIFICATION_FAILED
            db.commit()
            return {"error": job.error_message}
            
        # Reconstruct entities
        entities = []
        if doc.detected_entities:
            for ent_data in doc.detected_entities:
                entities.append(RedactionEntity(**ent_data))
                
        # Run Redaction
        redacted_bytes = SecureRedactionEngine.redact_document(file_bytes, doc.filename, entities)
        
        # Phase 7: Verification (Layered Zero-Trust & Uncertainty Gating)
        VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{doc.filename}", entities)
        
        # Phase 7.1: Fail-Closed Scanned/Raster Document Review Gate
        # Scanned/image-only PDFs and raster pages cannot automatically clear to COMPLETED/VERIFIED
        # because visual OCR on degraded raster scans cannot reliably certify absence of PII.
        canonical_rep = doc.canonical_representation or {}
        doc_metadata = canonical_rep.get("metadata", {})
        has_scanned_pages = doc_metadata.get("has_scanned_pages", False)
        
        # If metadata is missing, check file_bytes directly using fitz
        if not has_scanned_pages and (doc.filename.lower().endswith(".pdf") or doc.file_type == "application/pdf"):
            try:
                import fitz
                import re
                check_pdf = fitz.open(stream=file_bytes, filetype="pdf")
                for page_idx in range(len(check_pdf)):
                    p_text = re.sub(r'\s+', '', check_pdf[page_idx].get_text("text") or '')
                    if len(p_text) == 0:
                        has_scanned_pages = True
                        break
                check_pdf.close()
            except Exception:
                has_scanned_pages = True

        if has_scanned_pages:
            job.status = JobStatus.REVIEW_REQUIRED
            if job.result_storage_key:
                try:
                    StorageService.delete_document(job.result_storage_key)
                except Exception:
                    pass
                job.result_storage_key = None
            job.error_message = "Scanned/raster document requires human review under safety policy"
            if doc:
                doc.safety_status = SafetyStatus.VERIFICATION_FAILED
            db.commit()
            return {"status": "review_required", "reason": job.error_message}

        # Save redacted file using Cloud Storage Abstraction only after successful verification and digital-native check
        redacted_storage_key = StorageService.save_document(redacted_bytes, f"redacted_{doc.filename}", directory="redacted")
            
        job.status = JobStatus.COMPLETED
        job.result_storage_key = redacted_storage_key
        job.error_message = None
        if doc:
            doc.safety_status = SafetyStatus.VERIFIED
        db.commit()
        
        return {"status": "success", "result_path": redacted_storage_key}
        
    except VerificationUncertainty as e:
        job.status = JobStatus.REVIEW_REQUIRED
        if job.result_storage_key:
            try:
                StorageService.delete_document(job.result_storage_key)
            except Exception:
                pass
            job.result_storage_key = None
        job.error_message = VerificationEngine.sanitize_error_string(e.detail)
        if job.document:
            job.document.safety_status = SafetyStatus.VERIFICATION_FAILED
        db.commit()
        return {"status": "review_required", "reason": job.error_message}
    except Exception as e:
        job.status = JobStatus.FAILED
        if job.result_storage_key:
            try:
                StorageService.delete_document(job.result_storage_key)
            except Exception:
                pass
            job.result_storage_key = None
        err_msg = getattr(e, "detail", str(e))
        job.error_message = VerificationEngine.sanitize_error_string(str(err_msg))
        if job.document:
            job.document.safety_status = SafetyStatus.VERIFICATION_FAILED
        db.commit()
        return {"error": job.error_message}
    finally:
        db.close()
