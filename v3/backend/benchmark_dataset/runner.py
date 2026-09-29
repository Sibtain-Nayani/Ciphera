import json
import os
import sys

# Ensure backend imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from feature1_pipeline_upgrade import DetectionPipeline
from feature12_hindi_support import HindiPipeline

from matching import match_entities
from metrics import calculate_metrics, calculate_class_metrics
from generate_report import generate_markdown_report, save_baseline

def load_dataset(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def is_hindi(text):
    hindi_chars = sum(1 for c in text if '\u0900' <= c <= '\u097F')
    total_chars = len(text.replace(" ", ""))
    if total_chars == 0: return False
    return (hindi_chars / total_chars) > 0.05

def run_document(doc, en_pipeline, hi_pipeline):
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
                "end": start_idx + len(val)
            })
        else:
            print(f"WARNING: Ground truth value '{val}' not found in document '{doc['id']}'!")
    
    if is_hindi(text):
        results = hi_pipeline.run(text)
    else:
        results = en_pipeline.run(text)
        
    detected = [{
        "type": r.entity_type,
        "value": r.text,
        "start": r.start,
        "end": r.end
    } for r in results]
    
    # Match entities
    expected, detected = match_entities(expected, detected, iou_threshold=0.5)
    doc_metrics = calculate_metrics(expected, detected)
    
    return {
        "id": doc["id"],
        "expected": expected,
        "detected": detected,
        "metrics": doc_metrics
    }

def main():
    print("Initializing pipelines...")
    en_pipeline = DetectionPipeline(use_transformer=False)
    hi_pipeline = HindiPipeline()
    
    dataset_path = os.path.join(os.path.dirname(__file__), "dataset.json")
    dataset = load_dataset(dataset_path)
    
    print(f"\nLoaded {len(dataset)} documents.")
    
    all_expected = []
    all_detected = []
    document_results = []
    
    for idx, doc in enumerate(dataset):
        print(f"Evaluating {doc['id']} ({idx+1}/{len(dataset)})...")
        res = run_document(doc, en_pipeline, hi_pipeline)
        document_results.append(res)
        all_expected.extend(res["expected"])
        all_detected.extend(res["detected"])
        
    global_metrics = calculate_metrics(all_expected, all_detected)
    class_metrics = calculate_class_metrics(all_expected, all_detected)
    
    output_md = os.path.join(os.path.dirname(__file__), "eval_results.md")
    output_json = os.path.join(os.path.dirname(__file__), "baseline.json")
    
    generate_markdown_report(global_metrics, class_metrics, document_results, output_md)
    save_baseline(global_metrics, class_metrics, output_json)
    
    print(f"\nDone! Report generated at: {output_md}")
    print(f"Baseline saved at: {output_json}")

if __name__ == "__main__":
    main()
