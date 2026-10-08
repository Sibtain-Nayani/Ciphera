"""
Ciphera Phase R2: Scanned Document & Tabular Layout Benchmark
Evaluates multi-modal spatial extraction, columnar alignment, and tabular PII recovery.
"""

import os
import sys
import json
from typing import Dict, List, Any

sys.path.insert(0, '/app')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.schemas.document import CanonicalDocument, CanonicalBlock, BoundingBox
from app.services.detection_engine import DetectionEngine


def load_dataset() -> List[Dict[str, Any]]:
    dataset_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../benchmark/sets/tabular_scanned.json'))
    if not os.path.exists(dataset_path):
        # fallback path in docker container
        dataset_path = '/app/research/benchmark/sets/tabular_scanned.json'
    with open(dataset_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def run_benchmark() -> Dict[str, Any]:
    dataset = load_dataset()
    tp, fp, fn = 0, 0, 0
    detailed_results = []

    for item in dataset:
        full_text = item["full_text"]
        blocks = [
            CanonicalBlock(
                page_num=1,
                text=full_text,
                bbox=BoundingBox(x0=50, y0=50, x1=500, y1=700),
                start_index=0,
                end_index=len(full_text)
            )
        ]
        doc = CanonicalDocument(
            metadata={"filename": f"{item['id']}.pdf", "type": "pdf", "page_count": 1},
            blocks=blocks,
            full_text=full_text,
            page_count=1
        )

        preds = DetectionEngine.run_detection(doc)
        expected = item.get("expected_entities", [])

        matched_pred_indices = set()
        doc_tp, doc_fn = 0, 0

        for exp in expected:
            found = False
            for i, p in enumerate(preds):
                if i in matched_pred_indices:
                    continue
                # Match either type or text substring
                if exp["value"] in p.text and (p.entity_type == exp["type"] or exp["type"] in p.entity_type):
                    matched_pred_indices.add(i)
                    found = True
                    doc_tp += 1
                    tp += 1
                    break
            if not found:
                doc_fn += 1
                fn += 1

        doc_fp = len(preds) - len(matched_pred_indices)
        fp += doc_fp

        detailed_results.append({
            "id": item["id"],
            "name": item["name"],
            "expected_count": len(expected),
            "predicted_count": len(preds),
            "tp": doc_tp,
            "fp": doc_fp,
            "fn": doc_fn,
        })

    prec = tp / (tp + fp) if (tp + fp) > 0 else (1.0 if fp == 0 else 0.0)
    rec = tp / (tp + fn) if (tp + fn) > 0 else (1.0 if fn == 0 else 0.0)
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0

    summary = {
        "benchmark": "Phase R2 Scanned & Tabular Layout Benchmark",
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "documents": detailed_results
    }
    return summary


if __name__ == "__main__":
    rep_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../reports"))
    os.makedirs(rep_dir, exist_ok=True)
    results = run_benchmark()
    out_file = os.path.join(rep_dir, "r2_tabular_scanned.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"Phase R2 Tabular Benchmark Finished: Precision={results['precision']:.4f}, Recall={results['recall']:.4f}, F1={results['f1']:.4f}, FP={results['fp']}, FN={results['fn']}")
