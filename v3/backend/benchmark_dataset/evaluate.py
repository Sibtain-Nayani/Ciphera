import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add parent directory to path so we can import feature files
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from feature1_pipeline_upgrade import DetectionPipeline
from feature12_hindi_support import HindiPipeline

def load_dataset(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def is_hindi(text):
    hindi_chars = sum(1 for c in text if '\u0900' <= c <= '\u097F')
    total_chars = len(text.replace(" ", ""))
    if total_chars == 0: return False
    return (hindi_chars / total_chars) > 0.05

def evaluate_document(doc, en_pipeline, hi_pipeline):
    text = doc["content"]
    expected = doc["expected_entities"]
    
    # Simple language routing similar to backend main API
    if is_hindi(text):
        results = hi_pipeline.run(text)
    else:
        results = en_pipeline.run(text)
        
    detected = [{"type": r.entity_type, "value": r.text} for r in results]
    
    # Calculate Precision and Recall
    # This is a naive value-based matching (exact string match for now)
    true_positives = 0
    false_positives = 0
    
    expected_values = [(e["type"], e["value"]) for e in expected]
    detected_values = [(d["type"], d["value"]) for d in detected]
    
    for d in detected_values:
        if d in expected_values:
            true_positives += 1
            expected_values.remove(d) # Handle duplicates
        else:
            false_positives += 1
            
    false_negatives = len(expected_values)
    
    return {
        "id": doc["id"],
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "detected": detected_values
    }

def main():
    print("Initializing pipelines (this might take a few seconds)...")
    en_pipeline = DetectionPipeline(use_transformer=True)
    hi_pipeline = HindiPipeline()
    
    dataset_path = os.path.join(os.path.dirname(__file__), "dataset.json")
    dataset = load_dataset(dataset_path)
    
    print(f"\nLoaded {len(dataset)} documents from ground truth dataset.")
    
    total_tp = 0
    total_fp = 0
    total_fn = 0
    
    print("\n--- Evaluation Results ---")
    for doc in dataset:
        res = evaluate_document(doc, en_pipeline, hi_pipeline)
        total_tp += res["true_positives"]
        total_fp += res["false_positives"]
        total_fn += res["false_negatives"]
        
        print(f"\nDocument: {res['id']}")
        print(f"  TP: {res['true_positives']}, FP: {res['false_positives']}, FN: {res['false_negatives']}")
        print(f"  Detected: {res['detected']}")
        
    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    
    print("\n--- Baseline Metrics ---")
    print(f"Precision: {precision:.2f}")
    print(f"Recall:    {recall:.2f}")
    print(f"F1 Score:  {f1:.2f}")

if __name__ == "__main__":
    main()
