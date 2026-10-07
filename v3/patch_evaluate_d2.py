import os

path = r'evaluate.py'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace("""
from feature12_hindi_support import HindiPipeline

def load_dataset(filepath):""", """
from feature12_hindi_support import HindiPipeline, MixedDocumentHandler

def load_dataset(filepath):""")

code = code.replace("""def evaluate_document(doc, en_pipeline, hi_pipeline):
    text = doc["content"]
    expected_list = doc["expected_entities"]
    
    expected = []
    for e in expected_list:
        val = e["value"]
        start_idx = text.find(val)
        if start_idx != -1:
            expected.append({
                "type": e["type"],
                "value": val,
                "start": start_idx,
                "end": start_idx + len(val),
                "matched": False
            })
        else:
            print(f"WARNING: Ground truth value '{val}' not found in document '{doc['id']}'!")
    
    if is_hindi(text):
        results = hi_pipeline.run(text)
    else:
        results = en_pipeline.run(text)""", """def evaluate_document(doc, en_pipeline, hi_pipeline, mixed_handler):
    text = doc["content"]
    expected_list = doc["expected_entities"]
    
    expected = []
    for e in expected_list:
        val = e["value"]
        start_idx = text.find(val)
        if start_idx != -1:
            expected.append({
                "type": e["type"],
                "value": val,
                "start": start_idx,
                "end": start_idx + len(val),
                "matched": False
            })
        else:
            print(f"WARNING: Ground truth value '{val}' not found in document '{doc['id']}'!")
    
    if is_hindi(text):
        en_res = en_pipeline.run(text)
        hi_res = hi_pipeline.run(text, language_hint="mixed")
        merged_dicts = mixed_handler.merge_english_and_hindi(en_res, hi_res)
        class DummyEntity:
            def __init__(self, t, v, s, e):
                self.entity_type = t
                self.text = v
                self.start = s
                self.end = e
        results = [DummyEntity(d["entity_type"], d["text"], d["start"], d["end"]) for d in merged_dicts]
    else:
        results = en_pipeline.run(text)""")

code = code.replace("""    all_results = []
    
    for idx, doc in enumerate(dataset):
        print(f"Evaluating {doc['id']} ({idx+1}/{len(dataset)})...")
        res = evaluate_document(doc, en_pipeline, hi_pipeline)
        all_results.append(res)""", """    all_results = []
    mixed_handler = MixedDocumentHandler()
    
    for idx, doc in enumerate(dataset):
        print(f"Evaluating {doc['id']} ({idx+1}/{len(dataset)})...")
        res = evaluate_document(doc, en_pipeline, hi_pipeline, mixed_handler)
        all_results.append(res)""")

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched evaluate.py local")
