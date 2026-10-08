from feature1_pipeline_upgrade import DetectionPipeline

p = DetectionPipeline()
text_doc4 = "P A N : B V C P Q 9 9 9 9 Z\nA a d h a a r : 1 1 2 2   3 3 4 4   5 5 6 6"
text_doc10 = "The Aadhaar is 1l22 3344 55O6. PAN: I3CDEI234O. Legitimate serial OOOO1111OOOO."

print("DOC 4 RESULTS:")
for e in p.run(text_doc4):
    print(f"  {e.entity_type}: {e.text} (score={e.score})")

print("\nDOC 10 RESULTS:")
for e in p.run(text_doc10):
    print(f"  {e.entity_type}: {e.text} (score={e.score})")
