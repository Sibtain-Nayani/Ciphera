with open('backend/app/api/documents.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoint = """
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
"""

if "def download_redacted_job" not in content:
    content += new_endpoint
    with open('backend/app/api/documents.py', 'w', encoding='utf-8') as f:
        f.write(content)
