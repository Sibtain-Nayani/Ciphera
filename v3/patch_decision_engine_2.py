import re

FILE_PATH = "backend/feature1_pipeline_upgrade.py"

with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Patch OCR-Fuzzy Regexes
# AADHAAR
content = content.replace(
    r'(r"\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b",        "AADHAAR_NUMBER",   0.85),',
    r'(r"\b([0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{4})\b", "AADHAAR_NUMBER", 0.85),'
)
# PAN
content = content.replace(
    r'(r"\b([A-Z]{5}[0-9]{4}[A-Z])\b",                 "PAN_NUMBER",       0.95),',
    r'(r"\b([A-Z]{5}[0-9OoIiLl]{4}[A-Z])\b",                 "PAN_NUMBER",       0.95),'
)
# PHONE
content = content.replace(
    r'(r"(\+91[\s\-]?|0)?[6-9]\d{4}[\s\-]?\d{5}\b",   "PHONE_NUMBER",     0.85),',
    r'(r"(\+91[\s\-]?|0|[OoIiLl])?[6-9][0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{5}\b", "PHONE_NUMBER", 0.85),'
)
content = content.replace(
    r'(r"\b([6-9]\d{9})\b",                             "PHONE_NUMBER",     0.80),',
    r'(r"\b([6-9][0-9OoIiLl]{9})\b",                             "PHONE_NUMBER",     0.80),'
)


# 2. Patch De-Fragmentation and Context Gating
# First, insert De-Fragmentation at the end of analyze()
defrag_code = """
        # --- De-Fragmentation Sweep ---
        dense_chars = []
        original_indices = []
        for i, c in enumerate(text):
            if not c.isspace():
                dense_chars.append(c)
                original_indices.append(i)
        
        if dense_chars:
            dense_text = "".join(dense_chars)
            for pattern, entity_type, base_score in self._compiled:
                # Only apply defrag for strict structural IDs
                if entity_type not in {"PAN_NUMBER", "AADHAAR_NUMBER", "PHONE_NUMBER", "BANK_ACCOUNT", "CREDIT_CARD", "VOTER_ID", "GST_NUMBER", "IFSC_CODE", "EMAIL_ADDRESS"}:
                    continue
                    
                for m in pattern.finditer(dense_text):
                    raw_dense = m.group()
                    dense_start = m.start()
                    dense_end = m.end() - 1
                    
                    if dense_end >= len(original_indices):
                        continue
                        
                    orig_start = original_indices[dense_start]
                    orig_end = original_indices[dense_end] + 1
                    raw_orig = text[orig_start:orig_end]
                    
                    # Avoid duplicates
                    is_dup = False
                    for existing in results:
                        if existing.start <= orig_start and existing.end >= orig_end and existing.entity_type == entity_type:
                            is_dup = True
                            break
                    if is_dup: continue
                    
                    # Same context-gating logic
                    if entity_type == "BANK_ACCOUNT":
                        ctx = _get_context(text, orig_start, orig_end, self._CTX_WINDOW).lower()
                        if not any(kw in ctx for kw in self._BANK_CTX_KW):
                            continue
                            
                    if entity_type in {"PHONE_NUMBER", "AADHAAR_NUMBER"} and len(raw_dense) >= 10:
                        ctx = _get_context(text, orig_start, orig_end, self._CTX_WINDOW).lower()
                        # Strict gating: must have keyword if it was defragmented or if it's OCR fuzzy
                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        if not any(kw in ctx for kw in kw_set):
                            continue

                    score = self._validate(raw_orig, entity_type, base_score)
                    if score > 0:
                        results.append(DetectedEntity(
                            start=orig_start, end=orig_end,
                            entity_type=entity_type, text=raw_orig,
                            score=score, source=DetectionSource.REGEX,
                            context=_get_context(text, orig_start, orig_end),
                            type_locked=(score >= REGEX_TYPE_LOCK_THRESHOLD),
                        ))

        return results
"""

content = content.replace("        return results\n", defrag_code)

# We need to add _PHONE_CTX_KW and _AADHAAR_CTX_KW
keywords_patch = """
    _BANK_CTX_KW   = {"account","a/c","acc","bank","savings","current","neft","rtgs","imps"}
    _PHONE_CTX_KW  = {"phone", "mobile", "cell", "contact", "tel", "mob", "+91", "ph", "call", "whatsapp"}
    _AADHAAR_CTX_KW = {"aadhaar", "aadhar", "uid", "uidai", "vid"}
"""

content = content.replace('_BANK_CTX_KW   = {"account","a/c","acc","bank","savings","current","neft","rtgs","imps"}', keywords_patch)

# Context gating for normal phone/aadhaar matches
gating_patch = """
                # Bank account: require banking context within 80 chars
                if entity_type == "BANK_ACCOUNT":
                    ctx = _get_context(text, m.start(), m.end(), self._CTX_WINDOW).lower()
                    if not any(kw in ctx for kw in self._BANK_CTX_KW):
                        continue

                # Phone/Aadhaar strict gating
                if entity_type in {"PHONE_NUMBER", "AADHAAR_NUMBER"}:
                    # If it looks like a clean 10/12 digit number without formatting, require context to avoid tracking IDs
                    clean_raw = re.sub(r'\D', '', raw)
                    if len(clean_raw) in {10, 12}:
                        ctx = _get_context(text, m.start(), m.end(), self._CTX_WINDOW).lower()
                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        # If it has specific formatting (+91, hyphens) it's likely real. If it's purely digits, gate it.
                        if len(clean_raw) == len(raw.strip()):
                            if not any(kw in ctx for kw in kw_set):
                                continue
"""
content = content.replace("""                # Bank account: require banking context within 80 chars
                if entity_type == "BANK_ACCOUNT":
                    ctx = _get_context(text, m.start(), m.end(), self._CTX_WINDOW).lower()
                    if not any(kw in ctx for kw in self._BANK_CTX_KW):
                        continue""", gating_patch)


# Update the _validate function to support OCR fuzzy matching internally
# PAN needs to accept O as 0 and I/L as 1
validate_patch_pan = """        if entity_type == "PAN_NUMBER":
            pan = value.strip().upper()
            # De-fragment and OCR correction for validation
            pan = pan.replace(' ', '')
            # The last char must be letter, first 5 must be letters. The middle 4 must be digits, but might be OCR fuzzy.
            mid = pan[5:9].replace('O', '0').replace('I', '1').replace('L', '1')
            pan = pan[:5] + mid + pan[9:]
            if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan): return 0
            # 4th letter is the status (P=Person, C=Company, etc.)
            if pan[3] not in {'A', 'B', 'C', 'F', 'G', 'H', 'J', 'L', 'P', 'T', 'K', 'E'}:
                return base_score * 0.4 # likely false positive
            return base_score"""

content = content.replace("""        if entity_type == "PAN_NUMBER":
            pan = value.strip().upper()
            if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan): return 0
            # 4th letter is the status (P=Person, C=Company, etc.)
            if pan[3] not in {'A', 'B', 'C', 'F', 'G', 'H', 'J', 'L', 'P', 'T', 'K', 'E'}:
                return base_score * 0.4 # likely false positive
            return base_score""", validate_patch_pan)

validate_patch_aadhaar = """        if entity_type == "AADHAAR_NUMBER":
            digits = re.sub(r"[^\dOoIiLl]", "", value).upper()
            digits = digits.replace('O', '0').replace('I', '1').replace('L', '1')
            if len(digits) != 12: return 0
            if digits[0] in "01":  return 0
            if len(set(digits)) <= 3: return 0
            return base_score if _verhoeff(digits) else base_score * 0.72"""

content = content.replace("""        if entity_type == "AADHAAR_NUMBER":
            digits = re.sub(r"\D", "", value)
            if len(digits) != 12: return 0
            if digits[0] in "01":  return 0
            if len(set(digits)) <= 3: return 0
            return base_score if _verhoeff(digits) else base_score * 0.72""", validate_patch_aadhaar)

with open(FILE_PATH, 'w', encoding='utf-8') as f:
    f.write(content)
print("Decision Engine patched successfully.")
