with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

new_code = code.replace(
    'print("CONT 1"); continue',
    'print("CONT 1", entity_type, raw_dense); continue'
)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(new_code)
print("Patched.")
