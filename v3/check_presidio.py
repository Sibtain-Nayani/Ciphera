import json
from presidio_analyzer import AnalyzerEngine
analyzer = AnalyzerEngine(supported_languages=['en'])
for r in analyzer.registry.recognizers:
    r.context = []
text = "Phone: 9876543210. Patient 9876543211."
res = analyzer.analyze(text=text, entities=['PHONE_NUMBER'], language='en')
for r in res:
    print(f"Presidio score for '{text[r.start:r.end]}': {r.score}")
