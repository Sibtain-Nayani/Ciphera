from feature1_pipeline_upgrade import RegexStage
p = RegexStage()
text = "Please contact our support engineer Anjali\nDeshmukh at anjali.deshmukh\n@enterprise.com or call 912\n3456789."
import re
print("Text length:", len(text))
original_indices = []
norm = []
for i, char in enumerate(text):
    if not char.isspace() and char != '\n':
        norm.append(char)
        original_indices.append(i)
dense_text = "".join(norm)
print("dense_text:", dense_text)

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
    print("RAW_ORIG:", repr(raw_orig))
    
    ctx = _get_context(text, orig_start, orig_end, p._CTX_WINDOW).lower()
    print("CTX:", repr(ctx))
    kw_set = p._PHONE_CTX_KW
    print("KW_SET:", kw_set)
    ctx_clean_early = re.sub(r'[^a-z0-9]', '', ctx)
    has_kw = any(kw in ctx for kw in kw_set)
    has_kw_clean = any(kw in ctx_clean_early for kw in kw_set)
    print("HAS_KW:", has_kw, "HAS_KW_CLEAN:", has_kw_clean)
