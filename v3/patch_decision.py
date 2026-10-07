import os

file_path = "backend/app/services/decision_engine.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('ent.status = "REVIEW"', 'ent.status = "pending"')
content = content.replace('ent.status = "IGNORE"', 'ent.status = "rejected"')
content = content.replace('ent.status = "AUTO"', 'ent.status = "accepted"')

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Decision engine patched.")
