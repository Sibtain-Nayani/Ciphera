from feature1_pipeline_upgrade import DetectionPipeline
p = DetectionPipeline(use_transformer=False)
text = "Name: CGFDE9876T है।"
res = p.run(text)
print(res)
