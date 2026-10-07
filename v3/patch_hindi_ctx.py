import re

def patch_apply_hindi_context_scoring():
    with open('backend/feature12_hindi_support.py', 'r', encoding='utf-8') as f:
        content = f.read()
        
    old_logic = """def apply_hindi_context_scoring(
    entities: list[HindiEntity], text: str
) -> list[HindiEntity]:
    for entity in entities:
        ctx      = get_context(text, entity.start, entity.end, 80).lower()
        keywords = HINDI_LABELS.get(entity.entity_type, [])
        if any(kw.lower() in ctx for kw in keywords):
            entity.score = min(1.0, entity.score + 0.10)"""
            
    new_logic = """def apply_hindi_context_scoring(
    entities: list[HindiEntity], text: str
) -> list[HindiEntity]:
    import re
    for entity in entities:
        ctx_raw  = get_context(text, entity.start, entity.end, 80)
        parts = re.split(r'[\\n\\.]', ctx_raw)
        ctx_bounded = ""
        for p in parts:
            if entity.text.strip() in p:
                ctx_bounded = p.lower()
                break
        if not ctx_bounded:
            ctx_bounded = ctx_raw.lower()
            
        ctx = ctx_bounded
        keywords = HINDI_LABELS.get(entity.entity_type, [])
        if any(kw.lower() in ctx for kw in keywords):
            entity.score = min(1.0, entity.score + 0.10)"""
            
    content = content.replace(old_logic, new_logic)
    
    with open('backend/feature12_hindi_support.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("PATCH HINDI CONTEXT DONE")

patch_apply_hindi_context_scoring()
