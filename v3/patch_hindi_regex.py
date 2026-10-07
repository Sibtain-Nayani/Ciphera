import re

with open('backend/feature12_hindi_support.py', 'r', encoding='utf-8') as f:
    code = f.read()

old_regex = r"स्थायी\s*खाता\s*संख्या\|पैन\(\?:\s*नं\.\?\|\s*नंबर\)\?"
new_regex = r"स्थायी\s*खाता\s*संख्या|पैन(?:\s*कार्ड)?(?:\s*नं\.?|\s*नंबर)?|pan"

# Python regex replace won't work on literal strings easily. 
# Let's just find the exact line.
old_line = r"r'(?:(?:स्थायी\s*खाता\s*संख्या|पैन(?:\s*नं\.?|\s*नंबर)?)\s*[:\-]?\s*)'"
new_line = r"r'(?:(?:स्थायी\s*खाता\s*संख्या|पैन(?:\s*कार्ड)?(?:\s*नं\.?|\s*नंबर)?|pan)\s*[:\-]?\s*)'"

if old_line in code:
    code = code.replace(old_line, new_line)
    with open('backend/feature12_hindi_support.py', 'w', encoding='utf-8') as f:
        f.write(code)
    print("Replaced successfully.")
else:
    print("Not found.")
