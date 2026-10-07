from feature1_pipeline_upgrade import RegexStage
p = RegexStage()
text = "Please contact our support engineer Anjali\nDeshmukh at anjali.deshmukh\n@enterprise.com or call 912\n3456789."
import re

original_indices = []
norm = []
for i, char in enumerate(text):
    if not char.isspace() and char != '\n':
        norm.append(char)
        original_indices.append(i)
dense_text = "".join(norm)

raw_pattern = r"(\+91[\s\-]?|0|[OoIiLl])?[6-9][0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{5}\b"
if raw_pattern.startswith(r"\b"):
    raw_pattern = raw_pattern[2:]
if raw_pattern.endswith(r"\b"):
    raw_pattern = raw_pattern[:-2]
dense_pattern = re.compile(raw_pattern)

from feature1_pipeline_upgrade import _get_context

for m in dense_pattern.finditer(dense_text):
    orig_start = original_indices[m.start()]
    orig_end = original_indices[m.end() - 1] + 1
    raw_orig = text[orig_start:orig_end]
    print(f"Match found! orig_start={orig_start}, orig_end={orig_end}")
    
    # Simulate the exact code block
    entity_type = "PHONE_NUMBER"
    raw_dense = m.group()
    base_score = 0.85
    
    if entity_type in {"PHONE_NUMBER", "AADHAAR_NUMBER"} and len(raw_dense) >= 10:
        ctx = _get_context(text, orig_start, orig_end, p._CTX_WINDOW).lower()
        kw_set = p._PHONE_CTX_KW if entity_type == "PHONE_NUMBER" else p._AADHAAR_CTX_KW
        ctx_clean_early = re.sub(r'[^a-z0-9]', '', ctx)
        print("EARLY CONTEXT:", any(kw in ctx for kw in kw_set), any(kw in ctx_clean_early for kw in kw_set))
        if not any(kw in ctx for kw in kw_set) and not any(kw in ctx_clean_early for kw in kw_set):
            print("CONTINUE AT EARLY CONTEXT")
            continue
            
    score = p._validate(raw_orig, entity_type, base_score)
    print("SCORE AFTER VALIDATE:", score)
    
    tokens = raw_orig.split()
    print("TOKENS:", tokens, "LEN:", len(tokens), "REQ:", len(raw_dense) / 2)
    if len(tokens) >= (len(raw_dense) / 2):
        print("IN HIGHLY FRAGMENTED BLOCK!")
        ctx = _get_context(text, orig_start, orig_end, p._CTX_WINDOW).lower()
        ctx_clean = re.sub(r'[^a-z0-9]', '', ctx)
        kw_set = []
        has_ctx = any(kw in ctx_clean for kw in kw_set)
        if has_ctx:
            score = base_score
        else:
            print("CONTINUE AT HIGHLY FRAGMENTED")
            continue
            
    if score > 0:
        print("APPENDED!")
