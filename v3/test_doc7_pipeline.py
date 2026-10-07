from feature1_pipeline_upgrade import DetectionPipeline
p = DetectionPipeline(use_transformer=False)
text = "Please contact our support engineer Anjali\nDeshmukh at anjali.deshmukh\n@enterprise.com or call 912\n3456789."
res = p.run(text)
for r in res:
    print(r)
