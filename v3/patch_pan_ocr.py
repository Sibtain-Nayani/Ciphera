import re

with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Fix RegexStage
old_regex = r'r"\b([A-Z0158]{5}[0-9OoIiLlSsBb]{4}[A-Z0158])\b"'
new_regex = r'r"\b([A-Z01583]{5}[0-9OoIiLlSsBb]{4}[A-Z01583])\b"'

if old_regex in code:
    code = code.replace(old_regex, new_regex)
    print("Patched RegexStage PAN pattern.")

# Fix _validate prefix
old_prefix = "prefix = pan[:5].replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B')"
new_prefix = "prefix = pan[:5].replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B').replace('3', 'B')"
if old_prefix in code:
    code = code.replace(old_prefix, new_prefix)
    print("Patched _validate PAN prefix.")

old_suffix = "suffix = pan[9:].replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B')"
new_suffix = "suffix = pan[9:].replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B').replace('3', 'B')"
if old_suffix in code:
    code = code.replace(old_suffix, new_suffix)
    print("Patched _validate PAN suffix.")

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)

