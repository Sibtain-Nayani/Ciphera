with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()
code = code.replace("if '\\n' in gap or len(gap) > 3:", "if len(gap) > 3:")
with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("Patched.")
