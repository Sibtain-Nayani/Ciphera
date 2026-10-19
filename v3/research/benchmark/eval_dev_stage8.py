"""
Ciphera Priority 2: Stage 8 Development-Only Evaluation Harness
Evaluates the integrated Stage 7C implementation strictly against the frozen development corpus (34 documents, 108 ground-truth entities).
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime
from typing import Dict, List, Any, Tuple
import fitz

# Setup paths
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
backend_dir = os.path.join(repo_root, "backend")
research_dir = os.path.join(repo_root, "research")
sys.path.insert(0, repo_root)
sys.path.insert(0, backend_dir)
sys.path.insert(0, research_dir)

# Import backend services
import feature1_pipeline_upgrade as f1
from feature12_hindi_support import HindiPipeline, MixedDocumentHandler
from app.schemas.document import RedactionEntity, BoundingBox, CanonicalDocument, CanonicalBlock
from app.services.detection_engine import DetectionEngine
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import VerificationEngine, VerificationFailure, VerificationUncertainty

# Import Evaluator v1.1
from held_out_benchmark.evaluation.v1_1.matching_v1_1 import match_entities_bipartite_v1_1
from held_out_benchmark.evaluation.v1_1.metrics_calculator_v1_1 import calculate_aggregate_metrics_v1_1


def load_development_corpus() -> List[Dict[str, Any]]:
    sets_dir = os.path.join(research_dir, "benchmark", "sets")
    suites = [
        ("regression", "regression_set.json"),
        ("adversarial", "adversarial_set.json"),
        ("hard_negatives", "hard_negatives.json"),
        ("realistic_synthetic", "realistic_synthetic.json"),
        ("tabular_scanned", "tabular_scanned.json"),
    ]
    all_docs = []
    for category, filename in suites:
        path = os.path.join(sets_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            docs = json.load(f)
        for d in docs:
            d["category"] = category
            # Normalize text field
            if "content" in d:
                d["text"] = d["content"]
            elif "full_text" in d:
                d["text"] = d["full_text"]
            else:
                d["text"] = ""
            all_docs.append(d)
    return all_docs


def run_detection(text: str, en_pipeline, hi_pipeline, mixed_handler) -> List[Dict[str, Any]]:
    is_hi = any('\u0900' <= char <= '\u097F' for char in text)
    if is_hi:
        en_res = en_pipeline.run(text)
        hi_res = hi_pipeline.run(text, language_hint="mixed")
        merged = mixed_handler.merge_english_and_hindi(en_res, hi_res)
        results = []
        for d in merged:
            results.append({
                "type": d["entity_type"],
                "value": d["text"],
                "start": d["start"],
                "end": d["end"],
                "score": d.get("score", 0.8)
            })
    else:
        raw_res = en_pipeline.run(text)
        results = []
        for r in raw_res:
            results.append({
                "type": r.entity_type,
                "value": r.text,
                "start": r.start,
                "end": r.end,
                "score": getattr(r, "score", 0.8)
            })

    # Propagate columnar table context from verified headers
    from app.services.columnar_inference import ColumnarInferenceEngine
    text_inferred = ColumnarInferenceEngine.infer_text_tables(text)
    for inf in text_inferred:
        overlapping_idx = None
        for idx, d in enumerate(results):
            if max(inf["start"], d["start"]) < min(inf["end"], d["end"]):
                overlapping_idx = idx
                break
        if overlapping_idx is not None:
            if results[overlapping_idx]["type"] in ["PHONE_NUMBER", "DATE_TIME", "O", "UNKNOWN", "DATE_OF_BIRTH"] and \
               inf["entity_type"] in ["AADHAAR_NUMBER", "BANK_ACCOUNT", "PAN_NUMBER", "IFSC_CODE"]:
                results[overlapping_idx]["type"] = inf["entity_type"]
                results[overlapping_idx]["score"] = 0.85
        else:
            results.append({
                "type": inf["entity_type"],
                "value": inf["text"],
                "start": inf["start"],
                "end": inf["end"],
                "score": inf["score"]
            })
    return results


def render_pdf_for_document(text: str, doc_id: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    lines = text.split("\n")
    y = 50
    for line in lines:
        if line.strip():
            page.insert_text(fitz.Point(50, y), line, fontsize=10)
        y += 15
        if y > 750:
            page = doc.new_page(width=612, height=792)
            y = 50
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def main():
    print("=" * 80)
    print("CIPHERA PRIORITY 2: STAGE 8 DEVELOPMENT-ONLY EVALUATION")
    print("=" * 80)

    # 1. Preflight
    print("\n[PREFLIGHT] Environment & Integrity Verification")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip()
    status = subprocess.check_output(["git", "status", "-s"]).decode().strip()
    print(f"Git Commit: {commit}")
    print(f"Git Status: {'Dirty' if status else 'Clean'}")

    corpus = load_development_corpus()
    print(f"Loaded {len(corpus)} development documents across 5 suites.")

    total_expected_entities = sum(len(d.get("expected_entities", [])) for d in corpus)
    print(f"Total Ground-Truth Entities: {total_expected_entities}")

    # Initialize pipelines
    print("\n[PIPELINE INITIALIZATION]")
    t0 = time.time()
    en_pipeline = f1.DetectionPipeline()
    hi_pipeline = HindiPipeline()
    mixed_handler = MixedDocumentHandler()
    print(f"Pipelines initialized in {time.time()-t0:.2f}s")

    # Storage for per-document results
    pii_documents_for_evaluator = []
    clean_documents_for_evaluator = []

    doc_results = []
    category_summary = {}
    class_summary = {}

    total_clean_docs = 0
    clean_false_rejections = 0
    hard_negative_false_alarms = 0
    uncertain_documents = 0
    verifier_rejected_documents = 0
    verifier_passed_documents = 0
    residual_leak_count = 0

    print("\n[EVALUATION EXECUTION]")
    for doc_idx, doc in enumerate(corpus, 1):
        doc_id = doc.get("id", f"doc_{doc_idx}")
        category = doc.get("category", "unknown")
        text = doc.get("text", "")
        expected_raw = doc.get("expected_entities", [])
        is_clean = len(expected_raw) == 0

        if is_clean:
            total_clean_docs += 1

        # Format expected entities with character spans
        expected = []
        for idx, e in enumerate(expected_raw):
            val = e.get("value", "")
            etype = e.get("type")
            start = e.get("start")
            end = e.get("end")
            if start is None or end is None:
                start = text.find(val)
                end = start + len(val) if start != -1 else -1

            expected.append({
                "id": f"{doc_id}_exp_{idx+1:03d}",
                "type": etype,
                "value": val,
                "start": start,
                "end": end,
                "page_num": 1,
                "bbox": None,
                "is_ocr_derived": False
            })

        # Run Detection
        detections = run_detection(text, en_pipeline, hi_pipeline, mixed_handler)

        detected = []
        for j, d in enumerate(detections):
            detected.append({
                "id": f"{doc_id}_det_{j+1:03d}",
                "type": d["type"],
                "value": d["value"],
                "start": d["start"],
                "end": d["end"],
                "page_num": 1,
                "bbox": None
            })

        if is_clean and len(detected) > 0:
            hard_negative_false_alarms += len(detected)

        # Run End-to-End PDF Redaction and Verification
        pdf_bytes = render_pdf_for_document(text, doc_id)
        
        # Convert detected entities to RedactionEntity objects with bboxes
        # Using PyMuPDF page search for accurate native bboxes in the rendered test document
        doc_fitz = fitz.open(stream=pdf_bytes, filetype="pdf")
        redaction_entities = []
        for idx, d in enumerate(detected):
            page0 = doc_fitz[0]
            quads = page0.search_for(d["value"])
            bbox_obj = None
            if quads:
                r = quads[0]
                bbox_obj = BoundingBox(x0=r.x0, y0=r.y0, x1=r.x1, y1=r.y1)
            else:
                bbox_obj = BoundingBox(x0=50, y0=50, x1=200, y1=65)

            redaction_entities.append(RedactionEntity(
                id=f"red_{doc_id}_{idx}",
                entity_type=d["type"],
                text=d["value"],
                score=0.9,
                page_num=1,
                bbox=bbox_obj,
                start_index=d["start"],
                end_index=d["end"],
                status="pending"
            ))
        doc_fitz.close()

        # Execute Redaction
        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, f"{doc_id}.pdf", redaction_entities)

        # Execute Verification
        verifier_rejected = False
        verifier_uncertain = False
        verification_error = None
        leak_detected = False

        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, f"{doc_id}.pdf", redaction_entities)
            verifier_passed_documents += 1
        except VerificationUncertainty as e:
            verifier_uncertain = True
            uncertain_documents += 1
            verification_error = f"Uncertainty: {str(e)}"
        except VerificationFailure as e:
            verifier_rejected = True
            verifier_rejected_documents += 1
            leak_detected = True
            residual_leak_count += 1
            verification_error = f"Failure: {str(e)}"
        except Exception as e:
            verifier_rejected = True
            verifier_rejected_documents += 1
            verification_error = f"Error: {str(e)}"

        if is_clean and (verifier_rejected or verifier_uncertain):
            clean_false_rejections += 1

        # Run Evaluator v1.1 Bipartite Matcher
        matched_expected, matched_detected = match_entities_bipartite_v1_1(
            expected,
            detected,
            char_iou_threshold=0.50,
            spatial_iou_threshold=0.40,
            max_edit_distance=2
        )

        doc_record = {
            "id": doc_id,
            "category": category,
            "tier": "tier_1_digital",
            "is_synthetic": True,
            "expected": matched_expected,
            "detected": matched_detected,
            "artifact_residual_leak": leak_detected,
            "verifier_rejected": verifier_rejected,
            "verifier_uncertain": verifier_uncertain,
            "verification_error": verification_error
        }

        if len(expected) > 0:
            pii_documents_for_evaluator.append(doc_record)
        else:
            clean_documents_for_evaluator.append(doc_record)

        doc_results.append({
            "doc_id": doc_id,
            "category": category,
            "expected_count": len(expected),
            "detected_count": len(detected),
            "matched_count": sum(1 for e in matched_expected if e.get("matched_by") is not None),
            "missed_entities": [f"{e['type']}: {e['value']}" for e in matched_expected if e.get("matched_by") is None],
            "false_positives": [f"{d['type']}: {d['value']}" for d in matched_detected if d.get("matched_to") is None],
            "verifier_passed": not verifier_rejected and not verifier_uncertain,
            "verifier_uncertain": verifier_uncertain,
            "verifier_rejected": verifier_rejected,
            "error": verification_error
        })

    # Calculate Aggregate Evaluator v1.1 Metrics
    metrics = calculate_aggregate_metrics_v1_1(pii_documents_for_evaluator, clean_documents_for_evaluator)

    print("\n" + "=" * 80)
    print("STAGE 8 DEVELOPMENT EVALUATION RESULTS (Evaluator v1.1 Rules)")
    print("=" * 80)

    # Calculate Per-Category Metrics
    categories = {}
    for doc in pii_documents_for_evaluator + clean_documents_for_evaluator:
        cat = doc.get("category", "unknown")
        if cat not in categories:
            categories[cat] = {"pii": [], "clean": []}
        if len(doc.get("expected", [])) > 0:
            categories[cat]["pii"].append(doc)
        else:
            categories[cat]["clean"].append(doc)

    cat_metrics = {}
    for cat, docs in categories.items():
        cat_m = calculate_aggregate_metrics_v1_1(docs["pii"], docs["clean"])
        cat_metrics[cat] = {
            "document_count": len(docs["pii"]) + len(docs["clean"]),
            "expected_count": sum(len(d["expected"]) for d in docs["pii"]),
            "detected_count": sum(len(d["detected"]) for d in docs["pii"] + docs["clean"]),
            "true_positives": cat_m["micro"]["tp"],
            "false_positives": cat_m["micro"]["fp"],
            "false_negatives": cat_m["micro"]["fn"],
            "precision": cat_m["micro"]["precision"] or 0.0,
            "recall": cat_m["micro"]["recall"] or 0.0,
            "f1": cat_m["micro"]["f1"] or 0.0
        }

    print("\n" + "=" * 80)
    print("STAGE 8 DEVELOPMENT EVALUATION RESULTS (Evaluator v1.1 Rules)")
    print("=" * 80)

    micro = metrics["micro"]
    clean_m = metrics.get("clean_documents", {})
    clean_frr = clean_m.get("clean_doc_false_rejection_rate")
    clean_frr_str = f"{clean_frr:.2%}" if clean_frr is not None else "N/A"

    print(f"Total Documents: {len(corpus)}")
    print(f"PII Documents: {len(pii_documents_for_evaluator)} | Clean Documents: {len(clean_documents_for_evaluator)}")
    print(f"Ground-Truth Entities: {total_expected_entities}")
    print(f"Total Detections: {micro['tp'] + micro['fp']}")
    print(f"True Positives (TP): {micro['tp']}")
    print(f"False Positives (FP - Conventional): {micro['fp']}")
    print(f"Duplicate Detections (dups): {micro.get('dups', 0)}")
    print(f"False Negatives (FN): {micro['fn']}")
    print(f"Entity Precision: {micro['precision']:.2%}" if micro['precision'] is not None else "Entity Precision: N/A")
    print(f"Diagnostic Deduplicated Precision: {micro.get('precision_deduplicated_diagnostic', 0.0):.2%}")
    print(f"Entity Recall: {micro['recall']:.2%}" if micro['recall'] is not None else "Entity Recall: N/A")
    print(f"Entity F1: {micro['f1']:.2%}" if micro['f1'] is not None else "Entity F1: N/A")
    print(f"Exact Span Ratio: {micro.get('exact_span_ratio', 0.0):.2%}")
    print(f"Clean FRR (Hard Negatives): {clean_frr_str} ({clean_m.get('clean_docs_rejected_by_verifier', 0)}/{clean_m.get('clean_docs_evaluated_for_rejection', 0)})")
    print(f"Uncertainty / Review Rate: {uncertain_documents / len(corpus):.2%} ({uncertain_documents}/{len(corpus)})")
    print(f"Verifier Rejection Rate (All Docs): {verifier_rejected_documents / len(corpus):.2%} ({verifier_rejected_documents}/{len(corpus)})")
    print(f"Hard-Negative False Alarms: {hard_negative_false_alarms}")

    print("\n--- Per-Class Performance ---")
    print(f"{'Class':<22} | {'Exp':<5} | {'Det':<5} | {'TP':<4} | {'FP':<4} | {'FN':<4} | {'Precision':<10} | {'Recall':<10} | {'F1':<10}")
    print("-" * 88)
    for cls_name, cls_m in sorted(metrics["per_class"].items()):
        tp = cls_m["tp"]
        fp = cls_m["fp"]
        fn = cls_m["fn"]
        exp = tp + fn
        det = tp + fp
        p = f"{cls_m['precision']:.2%}" if cls_m['precision'] is not None else "N/A"
        r = f"{cls_m['recall']:.2%}" if cls_m['recall'] is not None else "N/A"
        f1_score = f"{cls_m['f1']:.2%}" if cls_m['f1'] is not None else "N/A"
        print(f"{cls_name:<22} | {exp:<5} | {det:<5} | {tp:<4} | {fp:<4} | {fn:<4} | {p:<10} | {r:<10} | {f1_score:<10}")

    print("\n--- Per-Category Performance ---")
    print(f"{'Category':<22} | {'Docs':<5} | {'Exp':<5} | {'Det':<5} | {'TP':<4} | {'FP':<4} | {'FN':<4} | {'Precision':<10} | {'Recall':<10} | {'F1':<10}")
    print("-" * 88)
    for cat_name, cat_m in sorted(cat_metrics.items()):
        docs_count = cat_m["document_count"]
        exp = cat_m["expected_count"]
        det = cat_m["detected_count"]
        tp = cat_m["true_positives"]
        fp = cat_m["false_positives"]
        fn = cat_m["false_negatives"]
        p = f"{cat_m['precision']:.2%}"
        r = f"{cat_m['recall']:.2%}"
        f1_score = f"{cat_m['f1']:.2%}"
        print(f"{cat_name:<22} | {docs_count:<5} | {exp:<5} | {det:<5} | {tp:<4} | {fp:<4} | {fn:<4} | {p:<10} | {r:<10} | {f1_score:<10}")

    # Output detailed JSON report
    report_output = {
        "metadata": {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "git_commit": commit,
            "evaluator": "Evaluator v1.1.0 (Development Evaluation)",
            "total_documents": len(corpus),
            "total_ground_truth": total_expected_entities
        },
        "aggregate_metrics": metrics,
        "operational_metrics": {
            "clean_documents_total": total_clean_docs,
            "clean_false_rejections": clean_false_rejections,
            "clean_false_rejection_rate": clean_false_rejections / total_clean_docs if total_clean_docs > 0 else 0.0,
            "hard_negative_false_alarms": hard_negative_false_alarms,
            "uncertain_documents": uncertain_documents,
            "uncertainty_rate": uncertain_documents / len(corpus),
            "verifier_rejected_documents": verifier_rejected_documents,
            "verifier_rejection_rate": verifier_rejected_documents / len(corpus),
            "residual_leak_count": residual_leak_count
        },
        "document_breakdown": doc_results
    }

    out_json_path = os.path.join(research_dir, "reports", "stage8_development_evaluation_report.json")
    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(report_output, f, indent=2)
    print(f"\nSaved detailed evaluation JSON to: {out_json_path}")


if __name__ == "__main__":
    main()
