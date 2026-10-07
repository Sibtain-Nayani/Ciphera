import re
text = "Please contact our support engineer Anjali\nDeshmukh at anjali.deshmukh\n@enterprise.com or call 912\n3456789."
orig_start = 93
orig_end = 106

def _get_context(text, start, end, window=25):
    s = max(0, start - window)
    e = min(len(text), end + window)
    return text[s:e]

ctx = _get_context(text, orig_start, orig_end, 25).lower()
ctx_clean_early = re.sub(r'[^a-z0-9]', '', ctx)
kw_set = {"phone", "mobile", "cell", "contact", "tel", "mob", "+91", "ph", "call", "whatsapp"}

print("ctx:", repr(ctx))
print("ctx_clean_early:", repr(ctx_clean_early))

found_in_ctx = []
for kw in kw_set:
    if kw in ctx: found_in_ctx.append(kw)
print("found_in_ctx:", found_in_ctx)

found_in_clean = []
for kw in kw_set:
    if kw in ctx_clean_early: found_in_clean.append(kw)
print("found_in_clean:", found_in_clean)
