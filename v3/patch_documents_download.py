import os

with open("backend/app/api/documents.py", "r", encoding="utf-8") as f:
    content = f.read()

old_download = """from fastapi.responses import FileResponse
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
    )"""

new_download = """from fastapi.responses import Response, RedirectResponse
import os
import io

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
        
    storage_key = job.error_message
    if not storage_key:
        raise HTTPException(status_code=404, detail="Storage key not found")
        
    from app.core.config import settings
    if settings.STORAGE_BACKEND == "s3":
        # Redirect to presigned S3 URL
        presigned_url = StorageService.generate_presigned_url(storage_key)
        return RedirectResponse(url=presigned_url)
    else:
        # Local fallback, stream bytes
        try:
            file_bytes = StorageService.get_document(storage_key)
            return Response(
                content=file_bytes,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="redacted_{job.document.filename}"' if job.document else 'attachment; filename="redacted.pdf"'
                }
            )
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")"""

content = content.replace(old_download, new_download)

with open("backend/app/api/documents.py", "w", encoding="utf-8") as f:
    f.write(content)
