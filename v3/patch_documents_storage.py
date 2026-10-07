import os

with open("backend/app/api/documents.py", "r", encoding="utf-8") as f:
    content = f.read()

# Replace imports
if "from app.services.storage import StorageService" not in content:
    content = content.replace("from app.services.detection_engine import DetectionEngine", 
                              "from app.services.detection_engine import DetectionEngine\nfrom app.services.storage import StorageService")

# Replace upload logic
upload_logic_old = """    # Save file to local storage
    import os
    os.makedirs("data/uploads", exist_ok=True)
    storage_key = f"data/uploads/{uuid.uuid4()}_{file.filename}"
    with open(storage_key, "wb") as f:
        f.write(file_bytes)"""

upload_logic_new = """    # Save file using Phase 9 Cloud Storage Abstraction
    storage_key = StorageService.save_document(file_bytes, file.filename, directory="uploads")"""

content = content.replace(upload_logic_old, upload_logic_new)

with open("backend/app/api/documents.py", "w", encoding="utf-8") as f:
    f.write(content)
