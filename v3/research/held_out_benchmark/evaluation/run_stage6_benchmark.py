"""
Runner script for executing Ciphera Priority 2 Stage 6 Frozen Benchmark.
Coordinates:
1. Loading the 50 held-out benchmark documents and annotations from CORPUS_MANIFEST.json.
2. Parsing documents via frozen DocumentParser.
3. Invoking the frozen detection engine (DecisionEngine.analyze / DetectionEngine) to predict entities.
4. Redacting each document via SecureRedactionEngine.redact_document with accepted/detected entities.
5. Performing multi-layer verification via VerificationEngine.verify_redacted_file.
6. Recording artifact residual leak status and exact vs fuzzy OCR tracking.
7. Feeding predictions, ground-truth annotations, and leak flags to eval_held_out.evaluate_corpus.
8. Generating comprehensive, privacy-masked JSON and Markdown reports with category, tier, and class breakdowns.
"""

import os
import sys
import json
import io
import fitz
from typing import List, Dict, Any
from fastapi import HTTPException

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
from app.services.verification_engine import VerificationEngine
from app.schemas.document import RedactionEntity, BoundingBox

from research.held_out_benchmark.evaluation.eval_held_out import evaluate_corpus
from research.held_out_benchmark.evaluation.report_generator import generate_markdown_report
from research.held_out_benchmark.evaluation.metrics_calculator import (
    calculate_per_class_metrics,
    calculate_aggregate_metrics
)


def run_frozen_benchmark():
    corpus_dir = os.path.join(RESEARCH_ROOT, "held_out_benchmark", "corpus")
    manifest_path = os.path.join(corpus_dir, "CORPUS_MANIFEST.json")
    docs_dir = os.path.join(corpus_dir, "documents")
    annotations_dir = os.path.join(corpus_dir, "annotations")
    output_dir = os.path.join(RESEARCH_ROOT, "reports", "held_out_stage6")
    os.makedirs(output_dir, exist_ok=True)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    manifest_docs = manifest.get("documents", [])
    print(f"======================================================================")
    print(f"CIPHERA PRIORITY 2: STAGE 6 FROZEN HELD-OUT BENCHMARK EXECUTION")
    print(f"Total Documents in Corpus: {len(manifest_docs)}")
    print(f"======================================================================")

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

        # Parse document using frozen DocumentParser
        canonical_doc = DocumentParser.parse(pdf_bytes, fname)
        full_text = canonical_doc.full_text

        # Run frozen detector pipeline: DetectionEngine + DecisionEngine
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

            detected_formatted.append({
                "id": f"{doc_id}_det_{d_idx+1:03d}",
                "type": d_type,
                "value": val,
                "start": start_char,
                "end": end_char,
                "page_num": p_num,
                "bbox": bbox
            })

        # Perform Redaction and Verification Security Audit
        # Create RedactionEntity list from detections (accepted status)
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
        verification_error_msg = None
        leak_evidence_type = None

        try:
            redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, fname, redact_entities)
            VerificationEngine.verify_redacted_file(redacted_bytes, fname, redact_entities)
        except HTTPException as exc:
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
        except Exception as ex:
            artifact_residual_leak = True
            verification_error_msg = f"Engine error: {str(ex)}"
            leak_evidence_type = "PIPELINE_EXCEPTION"

        # Format ground-truth entities
        expected_raw = ann_data.get("expected_entities", [])
        expected_formatted = []
        for e_idx, e in enumerate(expected_raw):
            expected_formatted.append({
                "id": e.get("id", f"{doc_id}_exp_{e_idx+1:03d}"),
                "type": e.get("entity_type"),
                "value": e.get("text"),
                "start": e.get("character_span", {}).get("start", 0),
                "end": e.get("character_span", {}).get("end", len(e.get("text", ""))),
                "page_num": e.get("page_num", 1),
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
            "verification_error": verification_error_msg,
            "leak_evidence_type": leak_evidence_type
        }

        prepared_documents.append(doc_record)
        tier_docs_map[tier].append(doc_record)
        category_docs_map.setdefault(category, []).append(doc_record)

        print(f"[{idx:02d}/50] Evaluated {doc_id} ({category}): Expected={len(expected_formatted)}, Detected={len(detected_formatted)}, LeakFlag={artifact_residual_leak}")

    # Run complete master evaluation
    overall_report = evaluate_corpus(prepared_documents, pipeline_runner_fn=None, allow_unmasked_synthetic=False)

    # Compute category-level and tier-level breakdowns
    tier_reports = {}
    for t_name, t_docs in tier_docs_map.items():
        tier_reports[t_name] = evaluate_corpus(t_docs, pipeline_runner_fn=None, allow_unmasked_synthetic=False)

    category_reports = {}
    for c_name, c_docs in category_docs_map.items():
        category_reports[c_name] = evaluate_corpus(c_docs, pipeline_runner_fn=None, allow_unmasked_synthetic=False)

    # Assemble comprehensive results package
    final_results = {
        "benchmark_run_version": "Stage_6_Frozen_Execution",
        "timestamp": overall_report["run_metadata"]["timestamp"],
        "git_commit": overall_report["run_metadata"].get("git_commit", "f77567d3d7b5106895305f64a1aee6aeed635692"),
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
                "leak_evidence_type": d["leak_evidence_type"],
                "verification_message": d["verification_error"]
            }
            for d in prepared_documents if d["artifact_residual_leak"]
        ],
        "diagnostics": overall_report.get("diagnostics", [])
    }

    # Save machine-readable JSON report
    json_path = os.path.join(output_dir, "STAGE_6_BENCHMARK_RESULTS.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(final_results, f, indent=2)

    # Generate Markdown Report
    md_path = os.path.join(output_dir, "STAGE_6_HELD_OUT_BENCHMARK_REPORT.md")
    md_content = generate_markdown_report(overall_report)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("======================================================================")
    print(f"BENCHMARK EXECUTION COMPLETE.")
    print(f"JSON Results: {json_path}")
    print(f"Markdown Report: {md_path}")
    print("======================================================================")


if __name__ == "__main__":
    run_frozen_benchmark()
