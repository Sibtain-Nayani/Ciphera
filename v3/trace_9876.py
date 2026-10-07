import sys
from feature1_pipeline_upgrade import DetectionPipeline
pipe = DetectionPipeline(use_transformer=False)
text = "A list of unrelated numbers: 9 8 7 6 5 4 3 2 1 0. And a table: Price 4 5 3 2 Qty 8 8 1 2 Total 9 9 0 1. Also: P.A.N. is A B C D E 1 2 3 4 F."
res = pipe.run(text)
print([(r.entity_type, text[r.start:r.end], r.score, r.source) for r in res])
