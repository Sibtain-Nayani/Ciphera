with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

new_code = code.replace(
    'if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "GST_NUMBER", "IFSC_CODE"}:',
    'if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "GST_NUMBER", "IFSC_CODE", "PHONE_NUMBER", "EMAIL_ADDRESS"}:'
)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(new_code)
print("Patched.")
