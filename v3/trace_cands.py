from feature1_pipeline_upgrade import DetectionPipeline
p = DetectionPipeline()
res = p.regex_stage.analyze("ABCDE1234F")
print("Regex Output:", res)

res_full = p.run("ABCDE1234F")
print("Full Output:", res_full)
