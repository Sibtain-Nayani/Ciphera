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
from feature12_hindi_support import HindiPipeline, MixedDocumentHandler


def evaluate_suite_with_pipelines(dataset: List[Dict[str, Any]], en_pipeline, hi_pipeline, mixed_handler) -> Dict[str, Any]:
    total_tp, total_fp, total_fn = 0, 0, 0
    per_class = {}

    for doc in dataset:
        text = doc["content"]
        expected_list = doc.get("expected_entities", [])
        expected = []
        for e in expected_list:
            val = e["value"]
            idx = text.find(val)
            if idx != -1:
                expected.append({
                    "type": e["type"],
                    "value": val,
                    "start": idx,
                    "end": idx + len(val),
                    "matched": False
                })

        is_hi = any('\u0900' <= char <= '\u097F' for char in text)
        if is_hi:
            en_res = en_pipeline.run(text)
            hi_res = hi_pipeline.run(text, language_hint="mixed")
            merged = mixed_handler.merge_english_and_hindi(en_res, hi_res)
            class Dummy:
                def __init__(self, t, v, s, e):
                    self.entity_type, self.text, self.start, self.end = t, v, s, e
            results = [Dummy(d["entity_type"], d["text"], d["start"], d["end"]) for d in merged]
        else:
            results = en_pipeline.run(text)

        matched_preds = set()
        for exp in expected:
            matched = False
            for i, pred in enumerate(results):
                if i in matched_preds:
                    continue
                overlap = max(0, min(exp["end"], pred.end) - max(exp["start"], pred.start))
                if overlap > 0 and pred.entity_type == exp["type"]:
                    exp["matched"] = True
                    matched_preds.add(i)
                    matched = True
                    total_tp += 1
                    t = exp["type"]
                    per_class.setdefault(t, {"tp": 0, "fp": 0, "fn": 0})["tp"] += 1
                    break
            if not matched:
                total_fn += 1
                t = exp["type"]
                per_class.setdefault(t, {"tp": 0, "fp": 0, "fn": 0})["fn"] += 1

        for i, pred in enumerate(results):
            if i not in matched_preds:
                total_fp += 1
                t = pred.entity_type
                per_class.setdefault(t, {"tp": 0, "fp": 0, "fn": 0})["fp"] += 1

    prec = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else (1.0 if total_fp == 0 else 0.0)
    rec = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else (1.0 if total_fn == 0 else 0.0)
    f1_score = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0

    return {
        "precision": prec,
        "recall": rec,
        "f1": f1_score,
        "tp": total_tp,
        "fp": total_fp,
        "fn": total_fn,
        "per_class": per_class
    }


def run_ablation(benchmark_dir: str) -> Dict[str, Any]:
    suites = {
        "Regression Suite": os.path.join(benchmark_dir, "regression_set.json"),
        "Adversarial Suite": os.path.join(benchmark_dir, "adversarial_set.json"),
        "Hard-Negative Suite": os.path.join(benchmark_dir, "hard_negatives.json"),
        "Realistic Synthetic Suite": os.path.join(benchmark_dir, "realistic_synthetic.json"),
    }

    loaded_suites = {}
    for s_name, path in suites.items():
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                loaded_suites[s_name] = json.load(f)

    en_pipeline = f1.DetectionPipeline()
    hi_pipeline = HindiPipeline()
    mixed_handler = MixedDocumentHandler()

    results = {"gating_on": {}, "gating_off": {}, "delta": {}}
    orig_analyze = f1.RegexStage.analyze

    # 1. Gating ON (Default Production)
    tot_tp, tot_fp, tot_fn = 0, 0, 0
    suite_metrics = {}
    global_per_class = {}
    for s_name, data in loaded_suites.items():
        m = evaluate_suite_with_pipelines(data, en_pipeline, hi_pipeline, mixed_handler)
        suite_metrics[s_name] = m
        tot_tp += m["tp"]
        tot_fp += m["fp"]
        tot_fn += m["fn"]
        for c, counts in m["per_class"].items():
            global_per_class.setdefault(c, {"tp": 0, "fp": 0, "fn": 0})
            global_per_class[c]["tp"] += counts["tp"]
            global_per_class[c]["fp"] += counts["fp"]
            global_per_class[c]["fn"] += counts["fn"]

    prec = tot_tp / (tot_tp + tot_fp) if (tot_tp + tot_fp) > 0 else (1.0 if tot_fp == 0 else 0.0)
    rec = tot_tp / (tot_tp + tot_fn) if (tot_tp + tot_fn) > 0 else (1.0 if total_fn == 0 else 0.0)
    f1_score = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0

    results["gating_on"] = {
        "global": {
            "precision": prec, "recall": rec, "f1": f1_score,
            "tp": tot_tp, "fp": tot_fp, "fn": tot_fn,
        },
        "suites": suite_metrics,
        "per_class": global_per_class
    }

    # 2. Gating OFF (Ablated)
    def unconstrained_analyze(self, text: str):
        results = []
        for pattern, entity_type, base_score in self._compiled:
            for m in pattern.finditer(text):
                raw = m.group()
                if raw.strip().lower() in f1.SUPPRESSION_LIST:
                    continue
                start_pos = m.start()
                end_pos = m.end()
                score = self._validate(raw, entity_type, base_score)
                if score <= 0:
                    continue
                results.append(f1.DetectedEntity(
                    start=start_pos, end=end_pos,
                    entity_type=entity_type, text=raw,
                    score=score, source=f1.DetectionSource.REGEX,
                    context=f1._get_context(text, start_pos, end_pos),
                    type_locked=(score >= f1.REGEX_TYPE_LOCK_THRESHOLD),
                ))
        return results

    f1.RegexStage.analyze = unconstrained_analyze

    try:
        tot_tp, tot_fp, tot_fn = 0, 0, 0
        suite_metrics = {}
        global_per_class = {}
        for s_name, data in loaded_suites.items():
            m = evaluate_suite_with_pipelines(data, en_pipeline, hi_pipeline, mixed_handler)
            suite_metrics[s_name] = m
            tot_tp += m["tp"]
            tot_fp += m["fp"]
            tot_fn += m["fn"]
            for c, counts in m["per_class"].items():
                global_per_class.setdefault(c, {"tp": 0, "fp": 0, "fn": 0})
                global_per_class[c]["tp"] += counts["tp"]
                global_per_class[c]["fp"] += counts["fp"]
                global_per_class[c]["fn"] += counts["fn"]

        prec = tot_tp / (tot_tp + tot_fp) if (tot_tp + tot_fp) > 0 else (1.0 if tot_fp == 0 else 0.0)
        rec = tot_tp / (tot_tp + tot_fn) if (tot_tp + tot_fn) > 0 else (1.0 if total_fn == 0 else 0.0)
        f1_score = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0

        results["gating_off"] = {
            "global": {
                "precision": prec, "recall": rec, "f1": f1_score,
                "tp": tot_tp, "fp": tot_fp, "fn": tot_fn,
            },
            "suites": suite_metrics,
            "per_class": global_per_class
        }
    finally:
        f1.RegexStage.analyze = orig_analyze

    # Deltas
    on_g = results["gating_on"]["global"]
    off_g = results["gating_off"]["global"]
    results["delta"] = {
        "precision_diff": on_g["precision"] - off_g["precision"],
        "recall_diff": on_g["recall"] - off_g["recall"],
        "f1_diff": on_g["f1"] - off_g["f1"],
        "fp_reduction": off_g["fp"] - on_g["fp"],
        "fn_diff": on_g["fn"] - off_g["fn"],
    }

    return results


if __name__ == "__main__":
    b_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../benchmark/sets"))
    rep_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../reports"))
    os.makedirs(rep_dir, exist_ok=True)
    res = run_ablation(b_dir)
    with open(os.path.join(rep_dir, "r1_1_context_gating.json"), "w") as f:
        json.dump(res, f, indent=2)
    print(f"R1.1 Completed: FP Reduction {res['delta']['fp_reduction']}, F1 Delta {res['delta']['f1_diff']:+.4f}")
