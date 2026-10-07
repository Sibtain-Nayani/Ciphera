import re
import math

class RegexStage:
    _PHONE_CTX_KW  = {"phone", "mobile", "cell", "contact", "tel", "mob", "+91", "ph", "call", "whatsapp"}
    _AADHAAR_CTX_KW = {"aadhaar", "aadhar", "uid", "uidai", "vid"}
    
    def __init__(self):
        self._compiled = [
            (re.compile(r"(\+91[\s\-]?|0|[OoIiLl])?[6-9][0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{5}\b"), "PHONE_NUMBER", 0.85),
            (re.compile(r"\b([6-9][0-9OoIiLl]{9})\b"), "PHONE_NUMBER", 0.80)
        ]

    def _validate(self, raw, entity_type, base_score):
        return base_score

    def analyze(self, text: str):
        results = []
        for pattern, entity_type, base_score in self._compiled:
            for m in pattern.finditer(text):
                raw = m.group()
                
                clean_raw = re.sub(r'\D', '', raw)
                if len(clean_raw) in {10, 12}:
                    # Shrink context to 35 chars
                    start_idx = max(0, m.start() - 35)
                    end_idx = min(len(text), m.end() + 35)
                    ctx_raw = text[start_idx:end_idx]
                    
                    parts = re.split(r'[\n\.]', ctx_raw)
                    ctx_bounded = ""
                    for p in parts:
                        if raw.strip() in p:
                            ctx_bounded = p.lower()
                            break
                    if not ctx_bounded:
                        ctx_bounded = ctx_raw.lower()
                        
                    kw_set = self._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else self._AADHAAR_CTX_KW
                    if len(clean_raw) == len(raw.strip()):
                        print(f"Checking context for {raw.strip()}: ctx_bounded='{ctx_bounded}'")
                        if not any(kw in ctx_bounded for kw in kw_set):
                            print(f"--> REJECTED {raw.strip()}")
                            continue
                        else:
                            print(f"--> ACCEPTED {raw.strip()}")

                score = self._validate(raw, entity_type, base_score)
                if score > 0:
                    results.append((entity_type, raw))
        return results

text = "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. \u092e\u092c\u093e\u0907\u0932 : 9876543214."
stage = RegexStage()
res = stage.analyze(text)
print("FINAL RESULTS:", res)
