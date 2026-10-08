import sys
import os

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath('.'))

import json
import re
from typing import Dict, List, Any
from feature1_pipeline_upgrade import DetectionPipeline
from feature12_hindi_support import HindiPipeline, MixedDocumentHandler

def is_hindi(text: str) -> bool:
    return any('\u0900' <= char <= '\u097F' for char in text)

def evaluate_document(doc: Dict[str, Any], en_pipeline, hi_pipeline, mixed_handler):
    text = doc["content"]
    expected_list = doc.get("expected_entities", [])
    
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
        
    matched_preds = set()
    tp, fp, fn = 0, 0, 0
    detailed_fp, detailed_fn = [], []
    
    # 1. Check True Positives & Match Expected
    for exp in expected:
        found_match = False
        for i, pred in enumerate(results):
            if i in matched_preds:
                continue
            # Overlap check
            overlap = max(0, min(exp["end"], pred.end) - max(exp["start"], pred.start))
            if overlap > 0 and pred.entity_type == exp["type"]:
                exp["matched"] = True
                matched_preds.add(i)
                found_match = True
                tp += 1
                break
        if not found_match:
            fn += 1
            detailed_fn.append(f"`{exp['type']}`: \"{exp['value']}\"")
            
    # 2. Check False Positives
    for i, pred in enumerate(results):
        if i not in matched_preds:
            fp += 1
            detailed_fp.append(f"`{pred.entity_type}`: \"{pred.text}\"")
            
    return {
        "id": doc["id"],
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "detailed_fp": detailed_fp,
        "detailed_fn": detailed_fn,
        "expected": expected,
        "predictions": results,
        "matched_indices": matched_preds
    }

def run_suite(filepath: str, en_pipeline, hi_pipeline, mixed_handler):
    with open(filepath, 'r', encoding='utf-8') as f:
        dataset = json.load(f)
    results = []
    for doc in dataset:
        res = evaluate_document(doc, en_pipeline, hi_pipeline, mixed_handler)
        results.append(res)
    return results

def compute_metrics(results):
    total_tp = sum(r["tp"] for r in results)
    total_fp = sum(r["fp"] for r in results)
    total_fn = sum(r["fn"] for r in results)
    
    prec = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else (1.0 if total_fp == 0 else 0.0)
    rec = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else (1.0 if total_fn == 0 else 0.0)
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
    
    return {
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "tp": total_tp,
        "fp": total_fp,
        "fn": total_fn
    }

def main():
    print("Initializing pipelines for multi-suite evaluation...")
    en_pipeline = DetectionPipeline()
    hi_pipeline = HindiPipeline()
    mixed_handler = MixedDocumentHandler()
    
    sets_dir = "benchmark_dataset/sets"
    suite_files = {
        "Regression Set (Frozen Historical)": os.path.join(sets_dir, "regression_set.json"),
        "Adversarial Set (Stress & Formatting)": os.path.join(sets_dir, "adversarial_set.json"),
        "Hard-Negative Set (Decoys & Non-PII)": os.path.join(sets_dir, "hard_negatives.json"),
        "Realistic Synthetic Set (Domain Docs)": os.path.join(sets_dir, "realistic_synthetic.json")
    }
    
    suite_results = {}
    all_doc_results = []
    
    for suite_name, filepath in suite_files.items():
        if not os.path.exists(filepath):
            print(f"Skipping {suite_name} (file not found: {filepath})")
            continue
        print(f"\n--- Running Suite: {suite_name} ---")
        res = run_suite(filepath, en_pipeline, hi_pipeline, mixed_handler)
        metrics = compute_metrics(res)
        suite_results[suite_name] = {"metrics": metrics, "docs": res}
        all_doc_results.extend(res)
        print(f"Precision: {metrics['precision']:.4f}, Recall: {metrics['recall']:.4f}, F1: {metrics['f1']:.4f}, TP: {metrics['tp']}, FP: {metrics['fp']}, FN: {metrics['fn']}")
        
    global_metrics = compute_metrics(all_doc_results)
    
    # Class level breakdown
    class_stats = {}
    for doc_res in all_doc_results:
        for exp in doc_res["expected"]:
            t = exp["type"]
            if t not in class_stats:
                class_stats[t] = {"tp": 0, "fp": 0, "fn": 0}
            if exp["matched"]:
                class_stats[t]["tp"] += 1
            else:
                class_stats[t]["fn"] += 1
                
        for i, pred in enumerate(doc_res["predictions"]):
            if i not in doc_res["matched_indices"]:
                t = pred.entity_type
                if t not in class_stats:
                    class_stats[t] = {"tp": 0, "fp": 0, "fn": 0}
                class_stats[t]["fp"] += 1
                
    # Generate Markdown Report
    report = []
    report.append("# Ciphera Multi-Suite Benchmark Expansion Report\n")
    report.append("## Global Combined Metrics Across All 4 Benchmark Suites")
    report.append(f"- **Total Test Documents:** {len(all_doc_results)}")
    report.append(f"- **Precision:** {global_metrics['precision']:.4f}")
    report.append(f"- **Recall:**    {global_metrics['recall']:.4f}")
    report.append(f"- **F1 Score:**  {global_metrics['f1']:.4f}")
    report.append(f"- **Total TP:**  {global_metrics['tp']}")
    report.append(f"- **Total FP:**  {global_metrics['fp']}")
    report.append(f"- **Total FN:**  {global_metrics['fn']}\n")
    
    report.append("## Per-Suite Breakdown")
    report.append("| Benchmark Suite | Docs | Precision | Recall | F1 Score | TP | FP | FN |")
    report.append("|---|---|---|---|---|---|---|---|")
    for name, data in suite_results.items():
        m = data["metrics"]
        report.append(f"| **{name}** | {len(data['docs'])} | {m['precision']:.4f} | {m['recall']:.4f} | {m['f1']:.4f} | {m['tp']} | {m['fp']} | {m['fn']} |")
    report.append("\n")
    
    report.append("## Per-Class Metrics (All Suites Combined)")
    report.append("| Entity Type | Precision | Recall | F1 Score | TP | FP | FN |")
    report.append("|---|---|---|---|---|---|---|")
    for t in sorted(class_stats.keys()):
        s = class_stats[t]
        p = s["tp"] / (s["tp"] + s["fp"]) if (s["tp"] + s["fp"]) > 0 else (1.0 if s["fp"] == 0 else 0.0)
        r = s["tp"] / (s["tp"] + s["fn"]) if (s["tp"] + s["fn"]) > 0 else (1.0 if s["fn"] == 0 else 0.0)
        f1_val = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
        report.append(f"| {t} | {p:.2f} | {r:.2f} | {f1_val:.2f} | {s['tp']} | {s['fp']} | {s['fn']} |")
    report.append("\n")
    
    report.append("## Document-by-Document Breakdown")
    for suite_name, data in suite_results.items():
        report.append(f"### {suite_name}\n")
        for doc in data["docs"]:
            report.append(f"#### `{doc['id']}`")
            report.append(f"- **True Positives:** {doc['tp']}, **False Positives:** {doc['fp']}, **False Negatives:** {doc['fn']}")
            if doc["detailed_fn"]:
                report.append("  - **FALSE NEGATIVES (LEAKS):**")
                for fn_item in doc["detailed_fn"]:
                    report.append(f"    - {fn_item}")
            if doc["detailed_fp"]:
                report.append("  - **FALSE POSITIVES (OVER-REDACTIONS):**")
                for fp_item in doc["detailed_fp"]:
                    report.append(f"    - {fp_item}")
            report.append("")
            
    report_content = "\n".join(report)
    with open("benchmark_dataset/benchmark_expansion_report.md", "w", encoding="utf-8") as f:
        f.write(report_content)
    print("\nBenchmark Expansion Report written to benchmark_dataset/benchmark_expansion_report.md")

if __name__ == "__main__":
    main()
