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

    results = {"structured_precedence": {}, "naive_nlp_precedence": {}, "delta": {}}
    orig_merge_and_vote = f1.merge_and_vote

    # 1. Structured Precedence (Ciphera Production)
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

    results["structured_precedence"] = {
        "global": {
            "precision": prec, "recall": rec, "f1": f1_score,
            "tp": tot_tp, "fp": tot_fp, "fn": tot_fn,
        },
        "suites": suite_metrics,
        "per_class": global_per_class
    }

    # 2. Naive NLP Precedence (Ablated: No structured precedence filter)
    def naive_merge_and_vote(
        candidates: list[f1.DetectedEntity],
        threshold: float = f1.CONFIDENCE_THRESHOLD,
    ) -> list[f1.DetectedEntity]:
        if not candidates:
            return []
        candidates.sort(key=lambda e: (e.start, -e.score))
        groups = []
        cur = [candidates[0]]
        end = candidates[0].end
        for entity in candidates[1:]:
            if entity.start < end:
                cur.append(entity)
                end = max(end, entity.end)
            else:
                groups.append(cur)
                cur = [entity]
                end = entity.end
        groups.append(cur)

        ratio = threshold / f1.CONFIDENCE_THRESHOLD if f1.CONFIDENCE_THRESHOLD > 0 else 1.0
        merged = []
        for group in groups:
            # Naive: Equal weighted vote among all candidates without structured filter
            tw = {}
            for e in group:
                w = f1.SOURCE_WEIGHTS.get(e.source.value, 1.0)
                tw[e.entity_type] = tw.get(e.entity_type, 0.0) + e.score * w
            elected_type = max(tw, key=tw.__getitem__)

            total_w = sum(f1.SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group)
            wscore = sum(e.score * f1.SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group) / total_w

            if wscore < threshold:
                continue
            base_floor = f1.TYPE_FLOOR.get(elected_type, f1.CONFIDENCE_THRESHOLD)
            effective_floor = min(base_floor * ratio, base_floor) if ratio < 1.0 else max(base_floor, threshold)
            if wscore < min(threshold, effective_floor):
                continue

            matching = [e for e in group if e.entity_type == elected_type]
            best = max(matching or group, key=lambda e: e.score * f1.SOURCE_WEIGHTS.get(e.source.value, 1.0))
            sources = list({e.source for e in group})
            merged.append(f1.DetectedEntity(
                start=best.start, end=best.end,
                entity_type=elected_type, text=best.text,
                score=min(wscore, 1.0),
                source=f1.DetectionSource.MERGED if len(sources) > 1 else sources[0],
                context=best.context, merged_from=sources,
            ))
        return merged

    f1.merge_and_vote = naive_merge_and_vote

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

        results["naive_nlp_precedence"] = {
            "global": {
                "precision": prec, "recall": rec, "f1": f1_score,
                "tp": tot_tp, "fp": tot_fp, "fn": tot_fn,
            },
            "suites": suite_metrics,
            "per_class": global_per_class
        }
    finally:
        f1.merge_and_vote = orig_merge_and_vote

    sp_g = results["structured_precedence"]["global"]
    nlp_g = results["naive_nlp_precedence"]["global"]
    results["delta"] = {
        "precision_diff": sp_g["precision"] - nlp_g["precision"],
        "recall_diff": sp_g["recall"] - nlp_g["recall"],
        "f1_diff": sp_g["f1"] - nlp_g["f1"],
        "fp_diff": sp_g["fp"] - nlp_g["fp"],
        "fn_diff": sp_g["fn"] - nlp_g["fn"],
    }

    return results


if __name__ == "__main__":
    b_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../benchmark/sets"))
    rep_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../reports"))
    os.makedirs(rep_dir, exist_ok=True)
    res = run_ablation(b_dir)
    with open(os.path.join(rep_dir, "r1_2_candidate_resolution.json"), "w") as f:
        json.dump(res, f, indent=2)
    print(f"R1.2 Completed: F1 Delta {res['delta']['f1_diff']:+.4f}, Precision Delta {res['delta']['precision_diff']:+.4f}")

