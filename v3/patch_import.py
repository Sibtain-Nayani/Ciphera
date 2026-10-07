import os

with open("backend/app/api/documents.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "from app.services.storage import StorageService" in line:
        continue
    new_lines.append(line)
    
new_content = "".join(new_lines)
new_content = new_content.replace("from app.services.document_parser import DocumentParser", "from app.services.document_parser import DocumentParser\nfrom app.services.storage import StorageService")

with open("backend/app/api/documents.py", "w", encoding="utf-8") as f:
    f.write(new_content)
