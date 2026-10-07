import sys
from feature12_hindi_support import HindiPipeline
pipeline = HindiPipeline()
text = "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. संपर्क: 9876543214."
raw = pipeline._spacy.analyse(text)
for r in raw:
    print(f"SPACY RAW: {r.entity_type} {r.text} {r.score}")
