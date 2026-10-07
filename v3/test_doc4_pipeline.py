from feature1_pipeline_upgrade import DetectionPipeline
p = DetectionPipeline(use_transformer=False)
doc4_text = "P A N : B V C P Q 9 9 9 9 Z\nA a d h a a r : 1 1 2 2   3 3 4 4   5 5 6 6"
print("Testing doc_004 text:", repr(doc4_text))
res = p.run(doc4_text)
print("Pipeline output:", res)
