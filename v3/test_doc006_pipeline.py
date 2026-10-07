from feature1_pipeline_upgrade import DetectionPipeline

pipeline = DetectionPipeline()
text = "The transaction was completed by Suresh Kumar on 24-11-2023. à¤‰à¤¸à¤•à¤¾ à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤¨à¤‚à¤¬à¤° 987654321012 à¤¹à¥ˆ à¤”à¤° PAN CGFDE9876T à¤¹à¥ˆà¥¤"
results = pipeline.run(text)
for r in results:
    print(r.entity_type, r.text, r.score)
