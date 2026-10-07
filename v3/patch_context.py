import re

def patch_file():
    with open('backend/feature1_pipeline_upgrade.py', 'r', encoding='utf-8') as f:
        content = f.read()

    old_logic = """def apply_context_scoring(
    entities: list[DetectedEntity], text: str
) -> list[DetectedEntity]:
    for entity in entities:
        ctx = _get_context(text, entity.start, entity.end, 60).lower()
        for etype, keywords, boost in CONTEXT_BOOSTS:
            if entity.entity_type == etype and any(kw in ctx for kw in keywords):
                entity.score = min(1.0, entity.score + boost)
        for etype, keywords, penalty in CONTEXT_SUPPRESSION:
            if entity.entity_type == etype and any(kw in ctx for kw in keywords):
                entity.score = max(0.0, entity.score + penalty)
    return entities"""

    new_logic = """def apply_context_scoring(
    entities: list[DetectedEntity], text: str
) -> list[DetectedEntity]:
    for entity in entities:
        ctx_raw = _get_context(text, entity.start, entity.end, 60)
        # Sentence/Line bind context to avoid cross-boundary false positives
        parts = re.split(r'[\\n\\.]', ctx_raw)
        ctx_bounded = ""
        for p in parts:
            if entity.text.strip() in p:
                ctx_bounded = p.lower()
                break
        if not ctx_bounded:
            ctx_bounded = ctx_raw.lower()
            
        for etype, keywords, boost in CONTEXT_BOOSTS:
            if entity.entity_type == etype and any(kw in ctx_bounded for kw in keywords):
                entity.score = min(1.0, entity.score + boost)
        for etype, keywords, penalty in CONTEXT_SUPPRESSION:
            if entity.entity_type == etype and any(kw in ctx_bounded for kw in keywords):
                entity.score = max(0.0, entity.score + penalty)
    return entities"""

    new_content = content.replace(old_logic, new_logic)
    
    if new_content == content:
        print("PATCH FAILED")
    else:
        with open('backend/feature1_pipeline_upgrade.py', 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("PATCH SUCCESSFUL")

patch_file()
