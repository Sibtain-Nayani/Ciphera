import os
import sys
import json
from typing import Dict, List, Any

sys.path.insert(0, '/app')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.schemas.document import CanonicalDocument, CanonicalBlock, BoundingBox, RedactionEntity
from app.services.columnar_inference import ColumnarInferenceEngine
from app.services.detection_engine import DetectionEngine


def generate_tabular_evaluation_set() -> List[Dict[str, Any]]:
    """
    Creates tabular evaluation documents containing multi-row structured records
    where top-row headers define column semantics (e.g. Account Number, Phone, PAN)
    but subsequent rows lack inline textual keywords.
    """
    tabular_docs = [
        {
            "id": "tab_salary_schedule",
            "type": "tabular",
            "full_text": "Employee Name | Designation | Salary Account | IFSC Code\nJohn Doe | Lead Engineer | 987654321012 | HDFC0001234\nAlice Smith | Product Mgr | 112233445566 | ICIC0005678\nRajesh Kumar | Tech Architect | 556677889900 | SBIN0009988\n",
            "blocks": [
                # Row 0 (Headers)
                CanonicalBlock(page_num=1, text="Employee Name\n", bbox=BoundingBox(x0=50, y0=50, x1=150, y1=70), start_index=0, end_index=14),
                CanonicalBlock(page_num=1, text="Designation\n", bbox=BoundingBox(x0=160, y0=50, x1=260, y1=70), start_index=16, end_index=28),
                CanonicalBlock(page_num=1, text="Salary Account\n", bbox=BoundingBox(x0=270, y0=50, x1=380, y1=70), start_index=30, end_index=45),
                CanonicalBlock(page_num=1, text="IFSC Code\n", bbox=BoundingBox(x0=390, y0=50, x1=480, y1=70), start_index=47, end_index=57),
                # Row 1 (John Doe)
                CanonicalBlock(page_num=1, text="John Doe\n", bbox=BoundingBox(x0=50, y0=80, x1=150, y1=100), start_index=58, end_index=67),
                CanonicalBlock(page_num=1, text="Lead Engineer\n", bbox=BoundingBox(x0=160, y0=80, x1=260, y1=100), start_index=69, end_index=83),
                CanonicalBlock(page_num=1, text="987654321012\n", bbox=BoundingBox(x0=270, y0=80, x1=380, y1=100), start_index=85, end_index=98),
                CanonicalBlock(page_num=1, text="HDFC0001234\n", bbox=BoundingBox(x0=390, y0=80, x1=480, y1=100), start_index=100, end_index=112),
                # Row 2 (Alice Smith)
                CanonicalBlock(page_num=1, text="Alice Smith\n", bbox=BoundingBox(x0=50, y0=110, x1=150, y1=130), start_index=113, end_index=125),
                CanonicalBlock(page_num=1, text="Product Mgr\n", bbox=BoundingBox(x0=160, y0=110, x1=260, y1=130), start_index=127, end_index=139),
                CanonicalBlock(page_num=1, text="112233445566\n", bbox=BoundingBox(x0=270, y0=110, x1=380, y1=130), start_index=141, end_index=154),
                CanonicalBlock(page_num=1, text="ICIC0005678\n", bbox=BoundingBox(x0=390, y0=110, x1=480, y1=130), start_index=156, end_index=168),
                # Row 3 (Rajesh Kumar)
                CanonicalBlock(page_num=1, text="Rajesh Kumar\n", bbox=BoundingBox(x0=50, y0=140, x1=150, y1=160), start_index=169, end_index=182),
                CanonicalBlock(page_num=1, text="Tech Architect\n", bbox=BoundingBox(x0=160, y0=140, x1=260, y1=160), start_index=184, end_index=199),
                CanonicalBlock(page_num=1, text="556677889900\n", bbox=BoundingBox(x0=270, y0=140, x1=380, y1=160), start_index=201, end_index=214),
                CanonicalBlock(page_num=1, text="SBIN0009988\n", bbox=BoundingBox(x0=390, y0=140, x1=480, y1=160), start_index=216, end_index=228),
            ],
            "expected_entities": [
                {"type": "BANK_ACCOUNT", "value": "987654321012"},
                {"type": "IFSC_CODE", "value": "HDFC0001234"},
                {"type": "BANK_ACCOUNT", "value": "112233445566"},
                {"type": "IFSC_CODE", "value": "ICIC0005678"},
                {"type": "BANK_ACCOUNT", "value": "556677889900"},
                {"type": "IFSC_CODE", "value": "SBIN0009988"},
            ]
        }
    ]
    return tabular_docs


def run_ablation() -> Dict[str, Any]:
    tabular_docs = generate_tabular_evaluation_set()

    results = {"with_columnar": {}, "without_columnar": {}, "delta": {}}

    for enable_spatial, label in [(True, "with_columnar"), (False, "without_columnar")]:
        tp, fp, fn = 0, 0, 0
        for item in tabular_docs:
            doc = CanonicalDocument(
                metadata={"filename": f"{item['id']}.pdf", "type": "pdf", "page_count": 1},
                blocks=item["blocks"],
                full_text=item["full_text"],
                page_count=1
            )

            # Detection
            orig_run_inf = ColumnarInferenceEngine.run_inference
            if not enable_spatial:
                ColumnarInferenceEngine.run_inference = staticmethod(lambda d, r: r)

            try:
                preds = DetectionEngine.run_detection(doc)
            finally:
                ColumnarInferenceEngine.run_inference = orig_run_inf

            # Match against expected
            matched_preds = set()
            for exp in item["expected_entities"]:
                found = False
                for i, p in enumerate(preds):
                    if i in matched_preds:
                        continue
                    if exp["value"] in p.text and (p.entity_type == exp["type"] or exp["type"] in p.entity_type):
                        matched_preds.add(i)
                        found = True
                        tp += 1
                        break
                if not found:
                    fn += 1

            for i, p in enumerate(preds):
                if i not in matched_preds:
                    # check if it is non-expected or spurious
                    fp += 1

        prec = tp / (tp + fp) if (tp + fp) > 0 else (1.0 if fp == 0 else 0.0)
        rec = tp / (tp + fn) if (tp + fn) > 0 else (1.0 if fn == 0 else 0.0)
        f1_score = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0

        results[label] = {
            "precision": prec,
            "recall": rec,
            "f1": f1_score,
            "tp": tp,
            "fp": fp,
            "fn": fn
        }

    c_on = results["with_columnar"]
    c_off = results["without_columnar"]
    results["delta"] = {
        "recall_improvement": c_on["recall"] - c_off["recall"],
        "f1_improvement": c_on["f1"] - c_off["f1"],
        "fn_reduction": c_off["fn"] - c_on["fn"],
    }
    return results


if __name__ == "__main__":
    rep_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../reports"))
    os.makedirs(rep_dir, exist_ok=True)
    res = run_ablation()
    with open(os.path.join(rep_dir, "r1_3_spatial_inference.json"), "w") as f:
        json.dump(res, f, indent=2)
    print(f"R1.3 Completed: Recall Gain {res['delta']['recall_improvement']:+.4f}")
