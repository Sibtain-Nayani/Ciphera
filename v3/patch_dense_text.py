with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

new_code = code.replace(
    'dense_text = "".join(norm)',
    'dense_text = "".join(norm)\n                print("DENSE TEXT:", repr(dense_text))'
)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(new_code)
print("Patched.")
