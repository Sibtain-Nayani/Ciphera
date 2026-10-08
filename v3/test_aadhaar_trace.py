from feature1_pipeline_upgrade import DetectionPipeline, RegexStage

text_doc10 = "The Aadhaar is 1l22 3344 55O6. PAN: I3CDEI234O. Legitimate serial OOOO1111OOOO."
reg = RegexStage()
results = reg.analyze(text_doc10)
print("RegexStage results:")
for r in results:
    print(r.entity_type, r.text, r.score)

# Let's also trace PATTERNS
import re
for pattern, entity_type, base_score in reg.PATTERNS:
    if entity_type == "AADHAAR_NUMBER":
        print("\nAadhaar Pattern:", pattern)
        for m in re.finditer(pattern, text_doc10):
            print("Matched raw:", m.group())
            val = m.group(1) if m.groups() else m.group()
            score = reg._validate(val, entity_type, base_score)
            print("Score from _validate:", score)
