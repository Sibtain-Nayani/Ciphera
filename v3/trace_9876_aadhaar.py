from feature1_pipeline_upgrade import DetectionPipeline

p = DetectionPipeline()
res = p.run("Aadhaar: 9876 5432 1098")
print("Entities found for 'Aadhaar: 9876 5432 1098':")
for e in res:
    print(e.entity_type, e.text, e.score)
