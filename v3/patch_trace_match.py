with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

new_code = code.replace(
    'for m in dense_pattern.finditer(dense_text):',
    'for m in dense_pattern.finditer(dense_text):\n                    print("MATCH FOUND:", entity_type, m.group())'
)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(new_code)
print("Patched.")
