import sys
from feature12_hindi_support import HindiPipeline
pipeline = HindiPipeline()
text = "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. संपर्क: 9876543214."
raw = pipeline._presidio.analyse(text, language="en")

from feature1_pipeline_upgrade import CONTEXT_BOOSTS

def trace_hindi_apply_context_scoring(entities, text):
    import re
    from feature12_hindi_support import get_context
    for entity in entities:
        ctx_raw = get_context(text, entity.start, entity.end, 60)
        parts = re.split(r'[\n\.]', ctx_raw)
        ctx_bounded = ""
        for p in parts:
            if entity.text.strip() in p:
                ctx_bounded = p.lower()
                break
        if not ctx_bounded:
            ctx_bounded = ctx_raw.lower()
            
        print(f"[{entity.text}] Bounded Context: '{ctx_bounded}'")
        for etype, keywords, boost in CONTEXT_BOOSTS:
            if entity.entity_type == etype:
                for kw in keywords:
                    if kw in ctx_bounded:
                        print(f"[{entity.text}] Boosted by keyword: '{kw}'")
    return entities

trace_hindi_apply_context_scoring(raw, text)
