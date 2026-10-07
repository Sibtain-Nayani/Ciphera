import json
from feature12_hindi_support import MixedDocumentHandler, HindiEntity, DetectionSource
from feature1_pipeline_upgrade import DetectedEntity

handler = MixedDocumentHandler()
en = [DetectedEntity(start=10, end=20, entity_type="DATE_OF_BIRTH", text="24-11-2023", score=0.85, source=DetectionSource.REGEX, context="")]
hi = [HindiEntity(start=10, end=20, entity_type="DATE_TIME", text="24-11-2023", score=0.85, source=DetectionSource.PRESIDIO, context="")]

# Simulating that DATE_TIME ends up first in the sort because score is slightly higher!
hi[0].score = 0.86

merged = handler.merge_english_and_hindi(en, hi)
print(json.dumps(merged, indent=2))
