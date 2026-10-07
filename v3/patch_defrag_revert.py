import re

with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Revert defrag list
code = code.replace(
    'if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "GST_NUMBER", "IFSC_CODE", "PHONE_NUMBER", "EMAIL_ADDRESS"}:',
    'if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "GST_NUMBER", "IFSC_CODE"}:'
)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched defrag list.")
