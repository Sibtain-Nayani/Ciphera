"""
Runner script for executing Ciphera Priority 2 Stage 9 Controlled Held-Out Benchmark.
Evaluates the integrated Stage 8A.2 production system against the 50 frozen held-out benchmark documents
under Evaluator v1.1 dual-channel bipartite matching rules.

Preconditions:
1. All 4 Stage 5/6 frozen baseline artifacts must match their recorded SHA-256 hashes.
2. The 50-document held-out corpus and annotations must remain strictly read-only.
3. Raw results are stored in research/reports/held_out_stage9/ (Stage 6 reports remain untouched).
"""

import os
import sys
import json
import hashlib
from datetime import datetime
from typing import List, Dict, Any

# Ensure backend and research root are on path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESEARCH_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(RESEARCH_ROOT, ".."))
BACKEND_ROOT = os.path.join(PROJECT_ROOT, "backend")

if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.services.document_parser import DocumentParser
from app.services.detection_engine import DetectionEngine
from app.services.decision_engine import DecisionEngine
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import (
    VerificationEngine,
    VerificationFailure,
    VerificationUncertainty
)
from app.schemas.document import RedactionEntity, BoundingBox

from research.held_out_benchmark.evaluation.v1_1.eval_held_out_v1_1 import evaluate_corpus_v1_1
from research.held_out_benchmark.evaluation.v1_1.report_generator_v1_1 import generate_markdown_report_v1_1


FROZEN_BASELINE_HASHES = {
    os.path.join(RESEARCH_ROOT, "held_out_benchmark", "corpus", "CORPUS_MANIFEST.json"): "e74434a6d4f24f02cb5b5a96cf476870a6641729017e024e4719c48abd04c870",
    os.path.join(RESEARCH_ROOT, "reports", "held_out_stage6", "STAGE_6_BENCHMARK_RESULTS.json"): "de72cd16e69b3414916cb491f0e47f82562f5bb57104de83e1f16912d5c0e986",
    os.path.join(RESEARCH_ROOT, "reports", "held_out_stage6", "STAGE_6_HELD_OUT_BENCHMARK_REPORT.md"): "f0e0a32fab7b9f5bcb4f09eb971409afe967edf08ed14b7414fe7dbe74e9ccdf",
    os.path.join(RESEARCH_ROOT, "held_out_benchmark", "FREEZE_RECORD.md"): "b20969bd28c12627ee5d8ed0dd94e39ea62002e0e352af010fcacc8c86c8512e"
}


def verify_frozen_baselines():
    print("[PREFLIGHT] Verifying frozen baseline artifact cryptographic hashes...")
    for file_path, expected_hash in FROZEN_BASELINE_HASHES.items():
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Missing frozen baseline file: {file_path}")
        with open(file_path, "rb") as f:
            actual_hash = hashlib.sha256(f.read()).hexdigest().lower()
        if actual_hash != expected_hash:
            raise RuntimeError(
                f"INTEGRITY FAILURE: Frozen baseline hash mismatch for {file_path}!\n"
                f"Expected: {expected_hash}\n"
                f"Actual:   {actual_hash}"
            )
        print(f"  [OK] {os.path.basename(file_path)}: {actual_hash[:16]}...")
    print("[PREFLIGHT] All 4 frozen baseline hashes verified pristine.\n")


def run_stage9_benchmark():
    verify_frozen_baselines()

    corpus_dir = os.path.join(RESEARCH_ROOT, "held_out_benchmark", "corpus")
    manifest_path = os.path.join(corpus_dir, "CORPUS_MANIFEST.json")
    docs_dir = os.path.join(corpus_dir, "documents")
    annotations_dir = os.path.join(corpus_dir, "annotations")
    output_dir = os.path.join(RESEARCH_ROOT, "reports", "held_out_stage9")
    os.makedirs(output_dir, exist_ok=True)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    manifest_docs = manifest.get("documents", [])
    print("=" * 70)
    print("CIPHERA PRIORITY 2: STAGE 9 HELD-OUT BENCHMARK EXECUTION (EVALUATOR v1.1)")
    print(f"Corpus Version: {manifest.get('corpus_version')}")
    print(f"Total Documents in Corpus: {len(manifest_docs)}")
    print(f"Output Directory: {output_dir}")
    print("=" * 70)

    prepared_documents = []
    category_docs_map = {}
    tier_docs_map = {"Tier A": [], "Tier B": []}

    for idx, item in enumerate(manifest_docs, start=1):
        doc_id = item["id"]
        tier = item["tier"]
        category = item["category"]
        fname = item["file_name"]
        pdf_path = os.path.join(docs_dir, fname)
        ann_path = os.path.join(annotations_dir, f"{doc_id}_annotation.json")

        with open(ann_path, "r", encoding="utf-8") as af:
            ann_data = json.load(af)

        with open(pdf_path, "rb") as pf:
            pdf_bytes = pf.read()

        # Parse document using canonical DocumentParser
        canonical_doc = DocumentParser.parse(pdf_bytes, fname)
        full_text = canonical_doc.full_text

        # Run detector pipeline (including P1 Columnar Inference)
        raw_detections = DetectionEngine.run_detection(canonical_doc)
        detected_entities_raw = DecisionEngine.apply_policies(raw_detections)

        # Convert to evaluator detected format
        detected_formatted = []
        for d_idx, d in enumerate(detected_entities_raw):
            val = getattr(d, "text", "") or ""
            d_type = getattr(d, "entity_type", "") or ""
            p_num = getattr(d, "page_num", 1) or 1
            bbox = getattr(d, "bbox", None)

            # Character offset search
            start_char = full_text.find(val)
            end_char = start_char + len(val) if start_char != -1 else 0

            bbox_dict = None
            if bbox:
                bbox_dict = {
                    "x0": getattr(bbox, "x0", 0.0),
                    "y0": getattr(bbox, "y0", 0.0),
                    "x1": getattr(bbox, "x1", 0.0),
                    "y1": getattr(bbox, "y1", 0.0)
                }

            detected_formatted.append({
                "id": f"{doc_id}_det_{d_idx+1:03d}",
                "type": d_type,
                "value": val,
                "start": start_char,
                "end": end_char,
                "page_num": p_num,
                "bbox": bbox_dict
            })

        # Build RedactionEntity list for redaction and verification
        redact_entities = []
        for d_idx, d in enumerate(detected_entities_raw):
            redact_entities.append(RedactionEntity(
                id=f"redact_{d_idx+1}",
                entity_type=d.entity_type,
                text=d.text,
                score=getattr(d, "score", 0.95),
                page_num=getattr(d, "page_num", 1),
                bbox=d.bbox,
                status="accepted"
            ))

        artifact_residual_leak = False
        verifier_rejected = False
        verification_error_msg = None
        leak_evidence_type = None

        try:
            redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, fname, redact_entities)
            VerificationEngine.verify_redacted_file(redacted_bytes, fname, redact_entities)
            verifier_rejected = False
            artifact_residual_leak = False
        except VerificationFailure as exc:
            verifier_rejected = True
            artifact_residual_leak = True
            verification_error_msg = str(exc.detail)
            if "Geometry Leak" in verification_error_msg:
                leak_evidence_type = "GEOMETRY_ENVELOPE_LEAK"
            elif "Fragment Leak" in verification_error_msg:
                leak_evidence_type = "RESIDUAL_FRAGMENT_LEAK"
            elif "Visual Leak" in verification_error_msg:
                leak_evidence_type = "OCR_VISUAL_LEAK"
            elif "Regex Leak" in verification_error_msg:
                leak_evidence_type = "TEXT_LAYER_REGEX_LEAK"
            else:
                leak_evidence_type = "VERIFICATION_FAILURE"
        except VerificationUncertainty as exc:
            verifier_rejected = True
            artifact_residual_leak = False  # Uncertainty is uninspected, not a confirmed residual leak
            verification_error_msg = str(exc.detail)
            leak_evidence_type = "VERIFICATION_UNCERTAINTY"
        except Exception as ex:
            verifier_rejected = True
            artifact_residual_leak = True
            verification_error_msg = f"Engine error: {str(ex)}"
            leak_evidence_type = "PIPELINE_EXCEPTION"

        # Format ground-truth entities
        expected_raw = ann_data.get("expected_entities", [])
        expected_formatted = []
        for e_idx, e in enumerate(expected_raw):
            bbox_raw = e.get("bbox")
            bbox_dict = None
            if bbox_raw:
                bbox_dict = {
                    "x0": bbox_raw.get("x0", 0.0),
                    "y0": bbox_raw.get("y0", 0.0),
                    "x1": bbox_raw.get("x1", 0.0),
                    "y1": bbox_raw.get("y1", 0.0)
                }

            expected_formatted.append({
                "id": e.get("id", f"{doc_id}_exp_{e_idx+1:03d}"),
                "type": e.get("entity_type"),
                "value": e.get("text"),
                "start": e.get("character_span", {}).get("start", 0),
                "end": e.get("character_span", {}).get("end", len(e.get("text", ""))),
                "page_num": e.get("page_num", 1),
                "bbox": bbox_dict,
                "is_ocr_derived": e.get("is_ocr_derived", False)
            })

        doc_record = {
            "id": doc_id,
            "file_name": fname,
            "tier": tier,
            "category": category,
            "content": full_text,
            "expected_entities": expected_formatted,
            "detected_entities": detected_formatted,
            "metadata": {
                "is_synthetic": True,
                "sha256": item.get("sha256")
            },
            "artifact_residual_leak": artifact_residual_leak,
            "verifier_rejected": verifier_rejected,
            "verification_error": verification_error_msg,
            "leak_evidence_type": leak_evidence_type
        }

        prepared_documents.append(doc_record)
        tier_docs_map[tier].append(doc_record)
        category_docs_map.setdefault(category, []).append(doc_record)

        print(
            f"[{idx:02d}/50] {doc_id:25} ({category:22}): "
            f"Exp={len(expected_formatted):2d}, Det={len(detected_formatted):2d}, "
            f"Rejected={verifier_rejected}, Leak={artifact_residual_leak}"
        )

    print("\n[EVALUATOR] Running Evaluator v1.1 dual-channel bipartite matching...")
    overall_report = evaluate_corpus_v1_1(
        prepared_documents,
        allow_unmasked_synthetic=False,
        char_iou_threshold=0.50,
        spatial_iou_threshold=0.40,
        max_edit_distance=2
    )

    # Compute category-level and tier-level breakdowns under Evaluator v1.1
    tier_reports = {}
    for t_name, t_docs in tier_docs_map.items():
        tier_reports[t_name] = evaluate_corpus_v1_1(
            t_docs,
            allow_unmasked_synthetic=False,
            char_iou_threshold=0.50,
            spatial_iou_threshold=0.40,
            max_edit_distance=2
        )

    category_reports = {}
    for c_name, c_docs in category_docs_map.items():
        category_reports[c_name] = evaluate_corpus_v1_1(
            c_docs,
            allow_unmasked_synthetic=False,
            char_iou_threshold=0.50,
            spatial_iou_threshold=0.40,
            max_edit_distance=2
        )

    # Assemble comprehensive results package
    final_results = {
        "benchmark_run_version": "Stage_9_Held_Out_Execution_v1_1",
        "timestamp": overall_report["run_metadata"]["timestamp"],
        "evaluator_version": "1.1.1-held-out-evaluator",
        "total_documents": len(prepared_documents),
        "overall": overall_report["metrics"],
        "per_class": overall_report["metrics"]["per_class"],
        "tier_metrics": {t: tier_reports[t]["metrics"] for t in tier_reports},
        "category_metrics": {c: category_reports[c]["metrics"] for c in category_reports},
        "residual_leak_audit": [
            {
                "document_id": d["id"],
                "category": d["category"],
                "tier": d["tier"],
                "verifier_rejected": d["verifier_rejected"],
                "artifact_residual_leak": d["artifact_residual_leak"],
                "leak_evidence_type": d["leak_evidence_type"],
                "verification_message": d["verification_error"]
            }
            for d in prepared_documents if d["verifier_rejected"] or d["artifact_residual_leak"]
        ],
        "diagnostics": overall_report.get("diagnostics", [])
    }

    # Save machine-readable JSON report
    json_path = os.path.join(output_dir, "STAGE_9_BENCHMARK_RESULTS.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(final_results, f, indent=2)

    # Generate Markdown Report
    md_path = os.path.join(output_dir, "STAGE_9_HELD_OUT_BENCHMARK_REPORT.md")
    md_content = generate_markdown_report_v1_1(overall_report)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("=" * 70)
    print("STAGE 9 BENCHMARK EXECUTION COMPLETE.")
    print(f"JSON Results:   {json_path}")
    print(f"Markdown Report: {md_path}")
    print("=" * 70)

    # Print summary table
    m = overall_report["metrics"]["micro"]
    cl = overall_report["metrics"]["clean_documents"]
    lk = overall_report["metrics"].get("privacy_leakage", {})
    print("\n" + "=" * 70)
    print("STAGE 9 BENCHMARK SUMMARY SCORECARD (Evaluator v1.1)")
    print("=" * 70)
    print(f"Total Documents:             50 (36 PII-bearing, 14 Clean)")
    print(f"Ground-Truth Entities:       {m.get('tp', 0) + m.get('fn', 0)}")
    print(f"True Positives (TP):         {m.get('tp', 0)} (Exact: {m.get('tp_exact', 0)})")
    print(f"False Negatives (FN):        {m.get('fn', 0)}")
    print(f"False Positives (FP):        {m.get('fp', 0)} (Dups: {m.get('dups', 0)})")
    print(f"Entity Precision:            {m.get('precision', 0.0) * 100:.2f}%")
    print(f"Diagnostic Dedup Precision:  {m.get('precision_deduplicated_diagnostic', 0.0) * 100:.2f}%")
    print(f"Entity Recall:               {m.get('recall', 0.0) * 100:.2f}%")
    print(f"Entity F1 Score:             {m.get('f1', 0.0) * 100:.2f}%")
    print(f"Clean Document FRR:          {cl.get('clean_doc_false_rejection_rate', 0.0) * 100:.2f}% ({cl.get('clean_docs_rejected_by_verifier', 0)}/{cl.get('clean_docs_evaluated_for_rejection', 0)})")
    print(f"PII Document Verifier Block: {lk.get('pii_docs_verifier_rejection_rate', 0.0) * 100:.2f}%")
    print(f"Artifact Residual Leak Rate: {lk.get('artifact_residual_doc_leak_rate', 0.0) * 100:.2f}%")
    print("=" * 70)


if __name__ == "__main__":
    run_stage9_benchmark()
