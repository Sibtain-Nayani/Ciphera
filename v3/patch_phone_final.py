import re

with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

old_phone = r'(?:(?:\+91|0|[OoIiLl])[\s\n\-]*)?([6-9](?:[\s\n\-]?[0-9OoIiLl]){9})\b'
new_phone = r'(?:(?:\+91|0|[OoIiLl])[\s\n\-]*)?([6-9][0-9OoIiLl]{1,4}[\s\n\-]+[0-9OoIiLl]{1,4}[\s\n\-]+[0-9OoIiLl]{1,4}|[6-9][0-9OoIiLl]{1,4}[\s\n\-]+[0-9OoIiLl]{5,8}|[6-9][0-9OoIiLl]{9})\b'

if old_phone in code:
    code = code.replace(old_phone, new_phone)
else:
    print("WARNING: Old phone pattern not found in code")

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched.")
