import sys
from feature1_pipeline_upgrade import DetectionPipeline
pipeline = DetectionPipeline(use_transformer=False)
text = "Contact tel: 8888888888\nOrder Reference 7777777777\nInvoice 6666666666"
entities = pipeline.run(text)
for e in entities:
    print(f"Entity: {e.entity_type} {e.text} Score: {e.score} Source: {e.source}")
