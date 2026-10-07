import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from feature1_pipeline_upgrade import DetectionPipeline
from feature12_hindi_support import HindiPipeline, MixedDocumentHandler

def load_dataset(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def is_hindi(text):
    hindi_chars = sum(1 for c in text if '\u0900' <= c <= '\u097F')
    total_chars = len(text.replace(" ", ""))
    if total_chars == 0: return False
    return (hindi_chars / total_chars) > 0.05

def calculate_iou(start1, end1, start2, end2):
    intersection = max(0, min(end1, end2) - max(start1, start2))
    union = max(end1, end2) - min(start1, start2)
    return intersection / union if union > 0 else 0.0

def evaluate_document(doc, en_pipeline, hi_pipeline, mixed_handler):
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
        results = en_pipeline.run(text)
        
    detected = [{
        "type": r.entity_type,
        "value": r.text,
        "start": r.start,
        "end": r.end,
        "matched": False
    } for r in results]
    
    true_positives = 0
    false_positives = 0
    
    for d in detected:
        best_match = None
        best_iou = 0.0
        
        for e in expected:
            if not e["matched"] and d["type"] == e["type"]:
                iou = calculate_iou(d["start"], d["end"], e["start"], e["end"])
                if iou > best_iou:
                    best_iou = iou
                    best_match = e
                    
        if best_match and best_iou > 0.5:
            true_positives += 1
            best_match["matched"] = True
            d["matched"] = True
        else:
            false_positives += 1
            
    false_negatives = sum(1 for e in expected if not e["matched"])
    
    return {
        "id": doc["id"],
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "expected": expected,
        "detected": detected
    }

def generate_report(results, output_path):
    total_tp = sum(r["true_positives"] for r in results)
    total_fp = sum(r["false_positives"] for r in results)
    total_fn = sum(r["false_negatives"] for r in results)
    
    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    
    class_metrics = {}
    for r in results:
        for e in r["expected"]:
            t = e["type"]
            if t not in class_metrics:
                class_metrics[t] = {"tp": 0, "fn": 0, "fp": 0}
            if e["matched"]:
                class_metrics[t]["tp"] += 1
            else:
                class_metrics[t]["fn"] += 1
                
        for d in r["detected"]:
            if not d["matched"]:
                t = d["type"]
                if t not in class_metrics:
                    class_metrics[t] = {"tp": 0, "fn": 0, "fp": 0}
                class_metrics[t]["fp"] += 1

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("# Adversarial Benchmark Report\n\n")
        f.write("## Global Metrics\n")
        f.write(f"- **Precision:** {precision:.4f}\n")
        f.write(f"- **Recall:**    {recall:.4f}\n")
        f.write(f"- **F1 Score:**  {f1:.4f}\n\n")
        
        f.write("## Per-Class Metrics\n")
        f.write("| Entity Type | Precision | Recall | F1 Score | TP | FP | FN |\n")
        f.write("|-------------|-----------|--------|----------|----|----|----|\n")
        
        for t, m in sorted(class_metrics.items()):
            p = m["tp"] / (m["tp"] + m["fp"]) if (m["tp"] + m["fp"]) > 0 else 0
            rc = m["tp"] / (m["tp"] + m["fn"]) if (m["tp"] + m["fn"]) > 0 else 0
            f1_c = 2 * (p * rc) / (p + rc) if (p + rc) > 0 else 0
            f.write(f"| {t} | {p:.2f} | {rc:.2f} | {f1_c:.2f} | {m['tp']} | {m['fp']} | {m['fn']} |\n")
            
        f.write("\n## Document Breakdown\n")
        for r in results:
            f.write(f"### {r['id']}\n")
            f.write(f"- **True Positives:** {r['true_positives']}\n")
            f.write(f"- **False Positives:** {r['false_positives']}\n")
            f.write(f"- **False Negatives:** {r['false_negatives']}\n")
            
            leaks = [e for e in r['expected'] if not e['matched']]
            if leaks:
                f.write("\n**🚨 FALSE NEGATIVES (LEAKS):**\n")
                for l in leaks:
                    f.write(f"- `{l['type']}`: \"{l['value']}\"\n")
            
            over_redacted = [d for d in r['detected'] if not d['matched']]
            if over_redacted:
                f.write("\n**⚠️ FALSE POSITIVES (OVER-REDACTION):**\n")
                for fp in over_redacted:
                    f.write(f"- `{fp['type']}`: \"{fp['value']}\"\n")
            f.write("\n---\n")

def main():
    print("Initializing pipelines (this might take a few seconds)...")
    en_pipeline = DetectionPipeline(use_transformer=False)
    hi_pipeline = HindiPipeline()
    
    dataset_path = os.path.join(os.path.dirname(__file__), "dataset.json")
    dataset = load_dataset(dataset_path)
    
    print(f"\nLoaded {len(dataset)} documents from adversarial dataset.")
    
    all_results = []
    mixed_handler = MixedDocumentHandler()
    
    for idx, doc in enumerate(dataset):
        print(f"Evaluating {doc['id']} ({idx+1}/{len(dataset)})...")
        res = evaluate_document(doc, en_pipeline, hi_pipeline, mixed_handler)
        all_results.append(res)
        
    output_md = os.path.join(os.path.dirname(__file__), "eval_results.md")
    generate_report(all_results, output_md)
    print(f"\nDone! Report generated at: {output_md}")

if __name__ == "__main__":
    main()
