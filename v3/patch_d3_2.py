import os

path = r'backend/feature1_pipeline_upgrade.py'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("""("PERSON",          ["enclave","flat","apartment","society","nagar","marg","street","road","address"], -0.40)""", """("PERSON",          ["enclave","flat","apartment","society","nagar","marg","street","road","address"], -0.50)""")

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched CONTEXT_SUPPRESSION again")
