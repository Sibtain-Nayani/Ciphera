import re

with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace normal loop logic
old_normal = '''                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        if len(clean_raw) == len(raw.strip()):
                            if not any(kw in ctx_bounded for kw in kw_set):'''

new_normal = '''                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        ctx_bounded_clean = re.sub(r'[^a-z0-9]', '', ctx_bounded)
                        if len(clean_raw) == len(raw.strip()):
                            if not any(kw in ctx_bounded for kw in kw_set) and not any(kw in ctx_bounded_clean for kw in kw_set):'''

code = code.replace(old_normal, new_normal)

# Replace defrag loop logic
old_defrag = '''                    if entity_type in {"PHONE_NUMBER", "AADHAAR_NUMBER"} and len(raw_dense) >= 10:
                        ctx = _get_context(text, orig_start, orig_end, self._CTX_WINDOW).lower()
                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        if not any(kw in ctx for kw in kw_set):'''

new_defrag = '''                    if entity_type in {"PHONE_NUMBER", "AADHAAR_NUMBER"} and len(raw_dense) >= 10:
                        ctx = _get_context(text, orig_start, orig_end, self._CTX_WINDOW).lower()
                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        ctx_clean_early = re.sub(r'[^a-z0-9]', '', ctx)
                        if not any(kw in ctx for kw in kw_set) and not any(kw in ctx_clean_early for kw in kw_set):'''

code = code.replace(old_defrag, new_defrag)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched feature1_pipeline_upgrade.py successfully.")
