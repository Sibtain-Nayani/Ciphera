from feature1_pipeline_upgrade import merge_and_vote, DetectedEntity, DetectionSource

candidates = [
    DetectedEntity(start=0, end=10, entity_type="DATE_OF_BIRTH", text="24-11-2023", score=0.78, source=DetectionSource.REGEX, context="", type_locked=False),
    DetectedEntity(start=0, end=10, entity_type="DATE_TIME", text="24-11-2023", score=0.85, source=DetectionSource.PRESIDIO, context="", type_locked=False)
]

merged = merge_and_vote(candidates)
print(merged)
