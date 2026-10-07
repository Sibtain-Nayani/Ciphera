import sys
sys.path.append('backend')
from feature1_pipeline_upgrade import DetectionPipeline

text = "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. \u092e\u092c\u093e\u0907\u0932 : 9876543214."

pipeline = DetectionPipeline()
entities = pipeline.run(text)
for e in entities:
    print(f"Entity: {e.entity_type} {e.text} Score: {e.score} Source: {e.source}")
