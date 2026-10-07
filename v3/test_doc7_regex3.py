from feature1_pipeline_upgrade import RegexStage
p = RegexStage()
text = "Please contact our support engineer Anjali\nDeshmukh at anjali.deshmukh\n@enterprise.com or call 912\n3456789."
import re
print("Length:", len(text))
res = p.analyze(text)
print("Returned", len(res), "results")
for r in res:
    print(r)
