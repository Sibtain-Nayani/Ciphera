import re

with open("backend/app/api/documents.py", "r") as f:
    content = f.read()

# Replace IDOR vulnerable queries
pattern = r'doc = db\.query\(Document\)\.filter\(Document\.id == document_id\)\.first\(\)\s+if not doc:\s+raise HTTPException\(status_code=404, detail="Document not found"\)'
replacement = 'doc = _get_doc_for_user(db, document_id, current_user)'
content = re.sub(pattern, replacement, content)

# Fix job endpoints
job_pattern = r'job = db\.query\(RedactionJob\)\.filter\(RedactionJob\.id == job_id\)\.first\(\)\s+if not job:\s+raise HTTPException\(status_code=404, detail="Job not found"\)'
job_replacement = """job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _get_doc_for_user(db, job.document_id, current_user) # enforce IDOR protection"""
content = re.sub(job_pattern, job_replacement, content)

# Also fix the upload_document org_id
upload_replacement = """    if current_user.global_role != "super_admin":
        user_org_ids = [m.org_id for m in current_user.org_memberships]
        if org_id not in user_org_ids:
            raise HTTPException(status_code=403, detail="Not authorized to upload to this organization")
            
    # Read file"""
content = content.replace('    # Read file', upload_replacement, 1)

# Add _get_doc_for_user helper AT THE END of imports
helper = """
def _get_doc_for_user(db: DBSession, document_id: str, current_user: User) -> Document:
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if current_user.global_role != "super_admin":
        user_org_ids = [m.org_id for m in current_user.org_memberships]
        if doc.org_id not in user_org_ids and doc.uploaded_by != current_user.id:
            raise HTTPException(status_code=404, detail="Document not found") # 404 to prevent enumeration
            
    return doc
"""
content = content.replace('router = APIRouter(prefix="/api/v3/documents", tags=["Documents"])', 
                          'router = APIRouter(prefix="/api/v3/documents", tags=["Documents"])\n' + helper)

with open("backend/app/api/documents.py", "w") as f:
    f.write(content)
