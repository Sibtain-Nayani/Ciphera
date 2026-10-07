import re
FILE_PATH = "backend/feature1_pipeline_upgrade.py"
with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

old_aadhaar_val = """        if entity_type == "AADHAAR_NUMBER":
            digits = re.sub(r"[^\\dOoIiLl]", "", value).upper()
            digits = digits.replace('O', '0').replace('I', '1').replace('L', '1')
            if len(digits) != 12: return 0
            if digits[0] in "01":  return 0
            if len(set(digits)) <= 3: return 0
            return base_score if _verhoeff(digits) else base_score * 0.72"""

new_aadhaar_val = """        if entity_type == "AADHAAR_NUMBER":
            digits = re.sub(r"[^\\dOoIiLl]", "", value).upper()
            digits = digits.replace('O', '0').replace('I', '1').replace('L', '1')
            if len(digits) != 12: return 0
            if digits[0] in "01":  return 0
            if len(set(digits)) <= 3: return 0
            
            has_ocr_chars = bool(re.search(r'[OoIiLl]', value))
            if _verhoeff(digits):
                return base_score
            elif has_ocr_chars:
                return base_score * 0.9
            else:
                return base_score * 0.72"""
content = content.replace(old_aadhaar_val, new_aadhaar_val)

old_pan_val = """        if entity_type == "PAN_NUMBER":
            pan = value.strip().upper()
            pan = pan.replace(' ', '')
            mid = pan[5:9].replace('O', '0').replace('I', '1').replace('L', '1')
            pan = pan[:5] + mid + pan[9:]
            if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan): return 0
            if pan[3] not in {'A', 'B', 'C', 'F', 'G', 'H', 'J', 'L', 'P', 'T', 'K', 'E'}:
                return base_score * 0.4
            return base_score"""

new_pan_val = """        if entity_type == "PAN_NUMBER":
            pan = value.strip().upper().replace(' ', '')
            prefix = pan[:5].replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B')
            mid = pan[5:9].replace('O', '0').replace('I', '1').replace('L', '1').replace('S', '5').replace('B', '8')
            suffix = pan[9:].replace('0', 'O').replace('1', 'I').replace('5', 'S').replace('8', 'B')
            
            norm_pan = prefix + mid + suffix
            if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', norm_pan): return 0
            if norm_pan[3] not in {'A', 'B', 'C', 'F', 'G', 'H', 'J', 'L', 'P', 'T', 'K', 'E'}:
                return base_score * 0.4
            return base_score"""
content = content.replace(old_pan_val, new_pan_val)

old_pan_reg = r'(r"\b([A-Z]{5}[0-9OoIiLl]{4}[A-Z])\b",                 "PAN_NUMBER",       0.95),'
new_pan_reg = r'(r"\b([A-Z0158]{5}[0-9OoIiLlSsBb]{4}[A-Z0158])\b",                 "PAN_NUMBER",       0.95),'
content = content.replace(old_pan_reg, new_pan_reg)

with open(FILE_PATH, 'w', encoding='utf-8') as f:
    f.write(content)
print("P1-C OCR normalization fixed.")
