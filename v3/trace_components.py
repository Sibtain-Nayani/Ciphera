import sys
from feature1_pipeline_upgrade import DetectionPipeline
pipe = DetectionPipeline(use_transformer=False)
text = "A list of unrelated numbers: 9 8 7 6 5 4 3 2 1 0."

print("--- REGEX ---")
for r in pipe.regex_stage.analyze(text):
    print(r)

print("--- PRESIDIO ---")
for r in pipe.presidio_stage.analyze(text):
    print(r)
    
print("--- SPACY ---")
for r in pipe.spacy_stage.analyze(text):
    print(r)
