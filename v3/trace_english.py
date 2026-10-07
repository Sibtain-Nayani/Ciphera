import sys
from feature1_pipeline_upgrade import DetectionPipeline
pipeline = DetectionPipeline(use_transformer=False)
text = "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. संपर्क: 9876543214."
entities = pipeline.run(text)
for e in entities:
    print(f"Entity: {e.entity_type} {e.text} Score: {e.score} Source: {e.source}")
