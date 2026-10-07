import os

file_path = "backend/app/services/verification_engine.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'def verify_redacted_file(file_bytes: bytes, filename: str) -> bool:',
    'def verify_redacted_file(file_bytes: bytes, filename: str, original_entities: list = None) -> bool:'
)

content = content.replace(
    'leaked = [e for e in entities if e.score > 0.85]',
    '''if original_entities is None:
            original_entities = []
        allowed_texts = [e.text for e in original_entities if e.status == "rejected"]
        leaked = [e for e in entities if e.score > 0.85 and e.text not in allowed_texts]'''
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)


file_path2 = "backend/app/tasks/redaction_tasks.py"
with open(file_path2, "r", encoding="utf-8") as f:
    content2 = f.read()

content2 = content2.replace(
    'VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{doc.filename}")',
    'VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{doc.filename}", entities)'
)

with open(file_path2, "w", encoding="utf-8") as f:
    f.write(content2)


file_path3 = "backend/app/api/documents.py"
with open(file_path3, "r", encoding="utf-8") as f:
    content3 = f.read()

content3 = content3.replace(
    'VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{doc.filename}")',
    'VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{doc.filename}", entities)'
)

with open(file_path3, "w", encoding="utf-8") as f:
    f.write(content3)

print("Patched verification engine.")
