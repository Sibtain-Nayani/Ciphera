from feature1_pipeline_upgrade import DetectionPipeline
pipeline = DetectionPipeline()
res = pipeline.run("Address: Flat 402, Lotus Enclave, Pune 411001")
for r in res:
    print(r.entity_type, r.text, r.score)
