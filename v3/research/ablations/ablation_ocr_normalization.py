import os
import sys
import json
import re
from typing import Dict, List, Any

sys.path.insert(0, '/app')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import feature1_pipeline_upgrade as f1


def run_ocr_ablation(benchmark_dir: str) -> Dict[str, Any]:
    adv_file = os.path.join(benchmark_dir, "adversarial_set.json")
    hard_neg_file = os.path.join(benchmark_dir, "hard_negatives.json")

    with open(adv_file, "r", encoding="utf-8") as f:
        adv_docs = json.load(f)
    with open(hard_neg_file, "r", encoding="utf-8") as f:
        hard_neg_docs = json.load(f)

    test_corpus = adv_docs + hard_neg_docs
    results = {}

    pipeline = f1.DetectionPipeline()

    # Variant B: Position-Aware Candidate Normalization (Default Production)
    tp_b, fp_b, fn_b = 0, 0, 0
    for doc in test_corpus:
        text = doc["content"]
        expected = doc.get("expected_entities", [])
        preds = pipeline.run(text)

        matched = set()
        for exp in expected:
            found = False
            for i, p in enumerate(preds):
                if i in matched: continue
                if exp["value"].replace(" ", "") in p.text.replace(" ", "") and p.entity_type == exp["type"]:
                    matched.add(i)
                    found = True
                    tp_b += 1
                    break
            if not found:
                fn_b += 1
        for i, p in enumerate(preds):
            if i not in matched:
                fp_b += 1

    prec_b = tp_b / (tp_b + fp_b) if (tp_b + fp_b) > 0 else (1.0 if fp_b == 0 else 0.0)
    rec_b = tp_b / (tp_b + fn_b) if (tp_b + fn_b) > 0 else (1.0 if fn_b == 0 else 0.0)
    f1_b = 2 * prec_b * rec_b / (prec_b + rec_b) if (prec_b + rec_b) > 0 else 0.0

    results["Variant_B_Position_Aware"] = {
        "precision": prec_b, "recall": rec_b, "f1": f1_b, "tp": tp_b, "fp": fp_b, "fn": fn_b
    }

    # Variant A: Raw OCR (Disable position-aware character substitutions in _validate)
    raw_fn = f1.RegexStage.__dict__['_validate'].__func__
    def raw_validate(value: str, entity_type: str, base_score: float) -> float:
        if entity_type == "AADHAAR_NUMBER":
            clean = re.sub(r'\s+', '', value)
            if not clean.isdigit() or len(clean) != 12:
                return 0
            if clean[0] == "0" or len(set(clean)) <= 3:
                return 0
            if f1._verhoeff(clean):
                return base_score
            return base_score * 0.72
        return raw_fn(value, entity_type, base_score)

    f1.RegexStage._validate = staticmethod(raw_validate)

    try:
        tp_a, fp_a, fn_a = 0, 0, 0
        for doc in test_corpus:
            text = doc["content"]
            expected = doc.get("expected_entities", [])
            preds = pipeline.run(text)

            matched = set()
            for exp in expected:
                found = False
                for i, p in enumerate(preds):
                    if i in matched: continue
                    if exp["value"].replace(" ", "") in p.text.replace(" ", "") and p.entity_type == exp["type"]:
                        matched.add(i)
                        found = True
                        tp_a += 1
                        break
                if not found:
                    fn_a += 1
            for i, p in enumerate(preds):
                if i not in matched:
                    fp_a += 1

        prec_a = tp_a / (tp_a + fp_a) if (tp_a + fp_a) > 0 else (1.0 if fp_a == 0 else 0.0)
        rec_a = tp_a / (tp_a + fn_a) if (tp_a + fn_a) > 0 else (1.0 if fn_a == 0 else 0.0)
        f1_a = 2 * prec_a * rec_a / (prec_a + rec_a) if (prec_a + rec_a) > 0 else 0.0

        results["Variant_A_Raw_OCR"] = {
            "precision": prec_a, "recall": rec_a, "f1": f1_a, "tp": tp_a, "fp": fp_a, "fn": fn_a
        }
    finally:
        f1.RegexStage._validate = staticmethod(raw_fn)

    # Variant C: Global Unconstrained Text Replacement
    tp_c, fp_c, fn_c = 0, 0, 0
    for doc in test_corpus:
        global_sub_text = doc["content"].replace("l", "1").replace("O", "0").replace("o", "0")
        expected = doc.get("expected_entities", [])
        preds = pipeline.run(global_sub_text)

        matched = set()
        for exp in expected:
            found = False
            for i, p in enumerate(preds):
                if i in matched: continue
                if exp["value"].replace(" ", "") in p.text.replace(" ", "") and p.entity_type == exp["type"]:
                    matched.add(i)
                    found = True
                    tp_c += 1
                    break
            if not found:
                fn_c += 1
        for i, p in enumerate(preds):
            if i not in matched:
                fp_c += 1

    prec_c = tp_c / (tp_c + fp_c) if (tp_c + fp_c) > 0 else (1.0 if fp_c == 0 else 0.0)
    rec_c = tp_c / (tp_c + fn_c) if (tp_c + fn_c) > 0 else (1.0 if fn_c == 0 else 0.0)
    f1_c = 2 * prec_c * rec_c / (prec_c + rec_c) if (prec_c + rec_c) > 0 else 0.0

    results["Variant_C_Global_Replacement"] = {
        "precision": prec_c, "recall": rec_c, "f1": f1_c, "tp": tp_c, "fp": fp_c, "fn": fn_c
    }

    return results


if __name__ == "__main__":
    b_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../benchmark/sets"))
    rep_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../reports"))
    os.makedirs(rep_dir, exist_ok=True)
    res = run_ocr_ablation(b_dir)
    with open(os.path.join(rep_dir, "r1_4_ocr_normalization.json"), "w") as f:
        json.dump(res, f, indent=2)
    print(f"R1.4 Completed: Pos-Aware F1 {res['Variant_B_Position_Aware']['f1']:.4f}")
