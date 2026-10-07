import sys
from feature12_hindi_support import HindiPipeline
pipeline = HindiPipeline()
text = "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. संपर्क: 9876543214."
norm = text
lang = "en"
detections = pipeline._presidio.engine.analyze(text=norm, entities=["PHONE_NUMBER"], language=lang)
for d in detections:
    print(f"PRESIDIO RAW: {d.entity_type} {text[d.start:d.end]} {d.score}")
