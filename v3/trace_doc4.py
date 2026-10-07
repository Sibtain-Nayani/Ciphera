from feature1_pipeline_upgrade import DetectionPipeline
p = DetectionPipeline()
res = p.regex_stage.analyze("A a d h a a r : 1 1 2 2   3 3 4 4   5 5 6 6")
print("Regex Output:", res)
