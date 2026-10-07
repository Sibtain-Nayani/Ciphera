import re
with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
    code = f.read()

new_code = code.replace(
    'if not any(kw in ctx for kw in kw_set) and not any(kw in ctx_clean_early for kw in kw_set):\n                            continue',
    'if not any(kw in ctx for kw in kw_set) and not any(kw in ctx_clean_early for kw in kw_set):\n                            print("CONT 1"); continue'
)

new_code = new_code.replace(
    'if has_ctx:\n                            score = base_score # Restore score due to strong context evidence\n                        else:\n                            continue # Ignore arbitrary lists without context',
    'if has_ctx:\n                            score = base_score # Restore score due to strong context evidence\n                        else:\n                            print("CONT 2"); continue'
)

new_code = new_code.replace(
    'if is_dup: continue',
    'if is_dup: print("CONT DUP"); continue'
)

with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
    f.write(new_code)
