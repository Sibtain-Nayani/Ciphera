import re

with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update EMAIL_ADDRESS pattern
old_email = r'\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b'
new_email = r'\b[a-zA-Z0-9._%+\-]+[\s\n]*@[\s\n]*[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b'
code = code.replace(old_email, new_email)

# 2. Update PHONE_NUMBER pattern
old_phone = r'(\+91[\s\-]?|0|[OoIiLl])?[6-9][0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{5}\b'
new_phone = r'(?:(?:\+91|0|[OoIiLl])[\s\n\-]*)?([6-9](?:[\s\n\-]?[0-9OoIiLl]){9})\b'
code = code.replace(old_phone, new_phone)

# 3. Remove \n checks from Presidio
code = re.sub(r'(\s+)if "\\n" in span:\s+continue', '', code)

# 4. Remove \n checks from SpaCy
code = re.sub(r'(\s+)if "\\n" in ent\.text:\s+continue', '', code)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched.")
