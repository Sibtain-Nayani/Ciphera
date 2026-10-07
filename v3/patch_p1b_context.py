import re
FILE_PATH = "backend/feature1_pipeline_upgrade.py"
with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

old_gating = """                # Phone/Aadhaar strict gating
                if entity_type in {"PHONE_NUMBER", "AADHAAR_NUMBER"}:
                    clean_raw = re.sub(r'\\D', '', raw)
                    if len(clean_raw) in {10, 12}:
                        ctx = _get_context(text, m.start(), m.end(), self._CTX_WINDOW).lower()
                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        if len(clean_raw) == len(raw.strip()):
                            if not any(kw in ctx for kw in kw_set):
                                continue"""

new_gating = """                # Phone/Aadhaar strict gating
                if entity_type in {"PHONE_NUMBER", "AADHAAR_NUMBER"}:
                    clean_raw = re.sub(r'\\D', '', raw)
                    if len(clean_raw) in {10, 12}:
                        # Shrink context to 35 chars
                        ctx_raw = _get_context(text, m.start(), m.end(), 35)
                        # Sentence/Line bind: don't cross period or newline backwards/forwards
                        parts = re.split(r'[\\n\\.]', ctx_raw)
                        ctx_bounded = ""
                        for p in parts:
                            if raw.strip() in p:
                                ctx_bounded = p.lower()
                                break
                        if not ctx_bounded:
                            ctx_bounded = ctx_raw.lower() # Fallback
                            
                        kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                        if len(clean_raw) == len(raw.strip()):
                            if not any(kw in ctx_bounded for kw in kw_set):
                                continue"""

content = content.replace(old_gating, new_gating)

with open(FILE_PATH, 'w', encoding='utf-8') as f:
    f.write(content)
print("P1-B Context gating fixed.")
