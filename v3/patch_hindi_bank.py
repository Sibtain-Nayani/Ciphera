import re

with open('backend/feature12_hindi_support.py', 'r', encoding='utf-8') as f:
    code = f.read()

old_bank = r"खाता\s*(?:संख्या|नं\.?|नंबर)?|बैंक\s*खाता"
new_bank = r"खाता\s*(?:संख्या|नं\.?|नंबर)?|बैंक\s*खाता|अकाउंट\s*(?:नं\.?|नंबर)?"

if old_bank in code:
    code = code.replace(old_bank, new_bank)
    with open('backend/feature12_hindi_support.py', 'w', encoding='utf-8') as f:
        f.write(code)
    print("Patched Hindi Bank regex.")
else:
    print("Could not find old bank regex.")
