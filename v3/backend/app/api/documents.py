from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session as DBSession
import hashlib
import os
import uuid

from app.core.database import get_db
from app.models.identity import User
from app.models.document import Document, JobStatus, SafetyStatus
from app.api.auth import get_current_user
from app.core.config import settings
from app.services.document_parser import DocumentParser
from app.services.storage import StorageService

router = APIRouter(prefix="/api/v3/documents", tags=["Documents"])

def _get_doc_for_user(db: DBSession, document_id: str, current_user: User) -> Document:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if current_user.global_role != "super_admin":
        user_org_ids = [m.org_id for m in current_user.org_memberships]
        # The old shared default organization is quarantined until its records
        # are moved by the legacy-org isolation migration.
        if doc.org_id == "default-org" or doc.org_id not in user_org_ids:
            raise HTTPException(status_code=404, detail="Document not found") # 404 to prevent enumeration
            
    return doc


@router.post(
    "/upload",
    responses={
        413: {"description": "Upload exceeds the configured byte limit"},
        415: {"description": "Unsupported file format or invalid text encoding"},
    },
)
async def upload_document(
    org_id: str | None = None,
    file: UploadFile = File(...), 
    db: DBSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # Older clients send the shared sentinel. Resolve it server-side to this
    # user's private workspace; never accept it as an actual tenant ID.
    if not org_id or org_id == "default-org":
        from app.api.auth import _ensure_user_default_org
        org_id = _ensure_user_default_org(current_user, db)

    if current_user.global_role != "super_admin":
        user_org_ids = [m.org_id for m in current_user.org_memberships]
        if org_id not in user_org_ids:
            raise HTTPException(status_code=403, detail="Not authorized to upload to this organization")
            
    # Read file with stream chunk size limiting (25MB default)
    chunks = []
    total_bytes = 0
    chunk_size = 1024 * 1024  # 1MB chunks
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds maximum upload limit of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB"
            )
        chunks.append(chunk)
    file_bytes = b"".join(chunks)
    
    # Process through Phase 2 Canonical Engine (VALIDATE BEFORE PERSISTENCE)
    canonical_doc = DocumentParser.parse(file_bytes, file.filename)
    
    # Process through Phase 4 Detection Engine
    from app.services.detection_engine import DetectionEngine
    raw_entities = DetectionEngine.run_detection(canonical_doc)
    
    # Process through Phase 5 Decision Engine
    from app.services.decision_engine import DecisionEngine
    # In a real app we fetch org.policy_config. Using default standard policy.
    policy_snapshot = {"mode": "balanced", "version": "balanced-v1"}
    entities = DecisionEngine.apply_policies(raw_entities, policy_config=policy_snapshot)
    canonical_representation = canonical_doc.model_dump()
    canonical_representation.setdefault("metadata", {})["redaction_policy"] = policy_snapshot
    
    # Save file using Phase 9 Cloud Storage Abstraction (only after successful validation)
    storage_key = StorageService.save_document(file_bytes, file.filename, directory="uploads")
    
    try:
        # Save to database
        db_doc = Document(
            id=str(uuid.uuid4()),
            org_id=org_id,
            uploaded_by=current_user.id,
            filename=file.filename,
            file_type=file.content_type,
            storage_key=storage_key,
            source_sha256=hashlib.sha256(file_bytes).hexdigest(),
            status=JobStatus.COMPLETED,
            safety_status=SafetyStatus.UNVERIFIED,
            canonical_representation=canonical_representation,
            detected_entities=[e.model_dump() for e in entities]
        )
        
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)
    except Exception:
        StorageService.delete_document(storage_key)
        raise
    
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
    doc = _get_doc_for_user(db, document_id, current_user)
        
    return doc.canonical_representation
@router.get("/{document_id}/entities")
def get_detected_entities(
    document_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = _get_doc_for_user(db, document_id, current_user)
        
    return {"entities": doc.detected_entities or []}
from app.schemas.document import RedactionEntity

@router.post("/{document_id}/redact", deprecated=True, responses={410: {"description": "Synchronous exports are disabled"}})
def redact_document_legacy(
    document_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Do not preserve this synchronous export path. It returned bytes directly,
    # bypassing the immutable job/policy snapshot and the async release checks.
    _get_doc_for_user(db, document_id, current_user)
    raise HTTPException(
        status_code=410,
        detail="Synchronous redaction exports are disabled; use POST /api/v3/documents/{document_id}/redact/async",
    )
from typing import List

@router.put("/{document_id}/entities")
def update_detected_entities(
    document_id: str,
    updated_entities: List[RedactionEntity],
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = _get_doc_for_user(db, document_id, current_user)
        
    # Replace the stored entities with the updated list from human review
    doc.detected_entities = [e.model_dump() for e in updated_entities]
    db.commit()
    
    return {"message": "Entities updated successfully", "entity_count": len(updated_entities)}
from app.models.document import RedactionJob, JobStatus
from app.tasks.redaction_tasks import process_redaction

@router.post("/{document_id}/redact/async", responses={415: {"description": "No verified release contract exists for this file format"}})
def redact_document_async(
    document_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = _get_doc_for_user(db, document_id, current_user)

    from app.services.release_gate import require_verified_pdf, UnsupportedReleaseFormat
    try:
        require_verified_pdf(doc.filename, doc.file_type)
    except UnsupportedReleaseFormat as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    from app.services.release_gate import canonical_sha256
    policy_snapshot = (doc.canonical_representation or {}).get("metadata", {}).get("redaction_policy")
    if not doc.storage_key or not doc.source_sha256:
        raise HTTPException(status_code=409, detail="Document has no immutable source checksum; upload it again before redaction")
    if not isinstance(policy_snapshot, dict) or not policy_snapshot.get("version"):
        raise HTTPException(status_code=409, detail="Document has no versioned policy snapshot; reprocess it before redaction")
    entities_snapshot = doc.detected_entities or []

    # Create job record
    job = RedactionJob(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        status=JobStatus.QUEUED,
        policy_config=policy_snapshot,
        policy_version=policy_snapshot["version"],
        policy_sha256=canonical_sha256(policy_snapshot),
        source_storage_key=doc.storage_key,
        source_sha256=doc.source_sha256,
        entities_snapshot=entities_snapshot,
        entities_sha256=canonical_sha256(entities_snapshot),
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
    _get_doc_for_user(db, job.document_id, current_user) # enforce IDOR protection
        
    has_artifact = bool(
        job.status == JobStatus.COMPLETED
        and job.result_storage_key
        and job.result_sha256
    )
    return {
        "job_id": job.id,
        "status": job.status,
        "error_message": job.error_message,
        "has_artifact": has_artifact
    }

from fastapi.responses import Response

@router.get("/redact/jobs/{job_id}/download")
def download_redacted_job(
    job_id: str,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _get_doc_for_user(db, job.document_id, current_user) # enforce IDOR protection
        
    if job.status == JobStatus.REVIEW_REQUIRED:
        raise HTTPException(status_code=422, detail="Document requires manual review before it can be downloaded")

    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job not completed")

    from app.services.release_gate import assert_document_matches_job_snapshot, InvalidReleaseSnapshot
    try:
        assert_document_matches_job_snapshot(job, job.document)
    except InvalidReleaseSnapshot as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
        
    storage_key = job.result_storage_key
    if not storage_key:
        raise HTTPException(status_code=404, detail="Artifact not found for this completed job")
    if not job.result_sha256:
        raise HTTPException(status_code=409, detail="Verified artifact checksum is missing; reprocess the document")

    clean_key = os.path.normpath(storage_key).replace("\\", "/")
    if clean_key.startswith("..") or not clean_key.startswith("redacted/"):
        raise HTTPException(status_code=403, detail="Unauthorized artifact access")

    if job.document and job.document.safety_status != SafetyStatus.VERIFIED:
        raise HTTPException(status_code=403, detail="Document safety verification not cleared for release")
        
    from app.core.config import settings
    if settings.STORAGE_BACKEND == "s3":
        # Return the exact bytes whose checksum was verified. A presigned URL
        # could otherwise serve different bytes if an object key were replaced
        # between this check and the client's later GET request.
        try:
            file_bytes = StorageService.get_document(storage_key)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="Redacted document artifact not found") from exc
        from app.services.release_gate import assert_artifact_integrity
        try:
            assert_artifact_integrity(job.result_sha256, file_bytes)
        except InvalidReleaseSnapshot as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return Response(
            content=file_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="redacted_{job.document.filename}"' if job.document else 'attachment; filename="redacted.pdf"'
            },
        )
    else:
        # Local fallback: enforce race-resistant canonical filesystem containment
        import stat
        base_dir = os.path.realpath(settings.LOCAL_STORAGE_DIR)
        redacted_dir = os.path.realpath(os.path.join(base_dir, "redacted"))
        target_path = os.path.join(base_dir, storage_key)
        
        # Open file descriptor securely
        open_flags = os.O_RDONLY
        if hasattr(os, "O_BINARY"):
            open_flags |= os.O_BINARY
        if hasattr(os, "O_NOFOLLOW"):
            open_flags |= os.O_NOFOLLOW
            
        try:
            fd = os.open(target_path, open_flags)
        except OSError:
            raise HTTPException(status_code=404, detail="Redacted document artifact not found")

        try:
            st = os.fstat(fd)
            # Ensure opened candidate is strictly a regular file
            if not stat.S_ISREG(st.st_mode):
                raise HTTPException(status_code=403, detail="Unauthorized artifact access")

            # Platform-specific symlink/reparse-point defense (Windows compatibility where O_NOFOLLOW is absent)
            if hasattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT") and bool(getattr(st, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
                raise HTTPException(status_code=403, detail="Unauthorized artifact access")

            # Verify the canonical path of the opened file resides strictly within redacted_dir
            opened_path = os.path.realpath(target_path)
            if not opened_path.startswith(redacted_dir + os.sep) or opened_path == redacted_dir:
                raise HTTPException(status_code=403, detail="Unauthorized artifact access")

            with os.fdopen(fd, "rb", closefd=False) as f:
                file_bytes = f.read()

            from app.services.release_gate import assert_artifact_integrity
            try:
                assert_artifact_integrity(job.result_sha256, file_bytes)
            except InvalidReleaseSnapshot as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

            return Response(
                content=file_bytes,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="redacted_{job.document.filename}"' if job.document else 'attachment; filename="redacted.pdf"'
                }
            )
        finally:
            try:
                os.close(fd)
            except OSError:
                pass
