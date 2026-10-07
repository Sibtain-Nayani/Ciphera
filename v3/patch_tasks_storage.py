import os

with open("backend/app/tasks/redaction_tasks.py", "r", encoding="utf-8") as f:
    content = f.read()

# Add import
if "from app.services.storage import StorageService" not in content:
    content = content.replace("from app.services.verification_engine import VerificationEngine", 
                              "from app.services.verification_engine import VerificationEngine\nfrom app.services.storage import StorageService")

old_load_logic = """        # Load file
        if not doc.storage_key or not os.path.exists(doc.storage_key):
            job.status = JobStatus.FAILED
            job.error_message = "Source file not found on server"
            db.commit()
            return {"error": job.error_message}
            
        with open(doc.storage_key, "rb") as f:
            file_bytes = f.read()"""

new_load_logic = """        # Load file using Cloud Storage Abstraction
        try:
            file_bytes = StorageService.get_document(doc.storage_key)
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = f"Failed to retrieve file: {str(e)}"
            db.commit()
            return {"error": job.error_message}"""
            
content = content.replace(old_load_logic, new_load_logic)

old_save_logic = """        # Save redacted file to disk
        redacted_storage_key = f"data/uploads/redacted_{uuid.uuid4()}_{doc.filename}"
        with open(redacted_storage_key, "wb") as f:
            f.write(redacted_bytes)"""
            
new_save_logic = """        # Save redacted file using Cloud Storage Abstraction
        redacted_storage_key = StorageService.save_document(redacted_bytes, f"redacted_{doc.filename}", directory="redacted")"""

content = content.replace(old_save_logic, new_save_logic)

with open("backend/app/tasks/redaction_tasks.py", "w", encoding="utf-8") as f:
    f.write(content)
