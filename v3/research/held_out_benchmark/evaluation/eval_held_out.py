"""
Master CLI Entrypoint for Ciphera Held-Out Benchmark Evaluator
Coordinates loading, maximum-weight bipartite matching, metrics calculation,
privacy sanitization, and report generation.
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime
from typing import Dict, List, Any

# Relative imports from current package
from .matching_bipartite import (
    match_entities_bipartite,
    evaluate_residual_ocr_leak,
    calculate_1d_iou
)
from .metrics_calculator import (
    calculate_aggregate_metrics
)
from .report_generator import (
    generate_json_report,
    generate_markdown_report
)
from .checksum_validator import verify_checksums


def get_git_metadata() -> Dict[str, str]:
    """Retrieves current Git commit and status for audit logging."""
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        commit = "UNKNOWN_COMMIT"

    try:
        status_output = subprocess.check_output(
            ["git", "status", "--porcelain"], stderr=subprocess.DEVNULL
        ).decode().strip()
        git_status = "dirty" if status_output else "clean"
    except Exception:
        git_status = "UNKNOWN_STATUS"

    return {
        "git_commit": commit,
        "git_status": git_status
    }


def evaluate_corpus(
    corpus_documents: List[Dict[str, Any]],
    pipeline_runner_fn=None,
    allow_unmasked_synthetic: bool = False
) -> Dict[str, Any]:
    """
    Evaluates a list of documents.
    If pipeline_runner_fn is None, expects documents to already contain 'detected_entities' (fixture mode).
    Otherwise, runs pipeline_runner_fn(doc['content']) to obtain detections.
    """
    pii_documents = []
    clean_documents = []

    for doc in corpus_documents:
        doc_id = doc.get("id", "doc_unknown")
        text = doc.get("content", "")
        expected_raw = doc.get("expected_entities", [])

        # Format expected entities
        expected = []
        for idx, e in enumerate(expected_raw):
            val = e.get("value", "")
            start = e.get("start")
            end = e.get("end")
            if start is None or end is None:
                start = text.find(val)
                end = start + len(val) if start != -1 else -1

            expected.append({
                "id": e.get("id", f"{doc_id}_e{idx}"),
                "type": e.get("type"),
                "value": val,
                "start": start,
                "end": end
            })

        # Obtain detected entities
        if pipeline_runner_fn is not None:
            raw_detections = pipeline_runner_fn(text)
            detected = []
            for j, r in enumerate(raw_detections):
                detected.append({
                    "id": f"{doc_id}_d{j}",
                    "type": getattr(r, "entity_type", r.get("type")),
                    "value": getattr(r, "text", r.get("value", "")),
                    "start": getattr(r, "start", r.get("start")),
                    "end": getattr(r, "end", r.get("end"))
                })
        else:
            detected = doc.get("detected_entities", [])

        # Match using deterministic maximum-weight bipartite matching
        matched_expected, matched_detected = match_entities_bipartite(
            expected, detected, iou_threshold=0.50
        )

        doc_record = {
            "id": doc_id,
            "is_synthetic": doc.get("metadata", {}).get("is_synthetic", True),
            "expected": matched_expected,
            "detected": matched_detected,
            "artifact_residual_leak": doc.get("artifact_residual_leak", False)
        }

        if len(expected) > 0:
            pii_documents.append(doc_record)
        else:
            clean_documents.append(doc_record)

    # Compute overall metrics
    metrics = calculate_aggregate_metrics(pii_documents, clean_documents)

    run_meta = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "python_version": sys.version.split()[0],
        **get_git_metadata(),
        "total_documents_evaluated": len(corpus_documents),
        "pii_bearing_documents_count": len(pii_documents),
        "clean_documents_count": len(clean_documents)
    }

    all_doc_records = pii_documents + clean_documents
    report_json = generate_json_report(
        metrics,
        all_doc_records,
        run_meta,
        allow_unmasked_synthetic=allow_unmasked_synthetic
    )

    return report_json


def main():
    parser = argparse.ArgumentParser(description="Ciphera Held-Out Benchmark Evaluator")
    parser.add_argument("--manifest", type=str, required=True, help="Path to manifest JSON")
    parser.add_argument("--output-dir", type=str, default="research/reports", help="Output directory")
    parser.add_argument("--checksum-file", type=str, default=None, help="Path to CHECKSUMS.sha256")
    parser.add_argument("--debug-unmasked-synthetic-only", action="store_true", help="Opt-in raw values for synthetic only")

    args = parser.parse_args()

    # 1. Verify Checksums if provided
    if args.checksum_file:
        base_dir = os.path.dirname(os.path.abspath(args.checksum_file))
        passed, errors = verify_checksums(base_dir, args.checksum_file)
        if not passed:
            print("ERROR: Checksum validation failed!")
            for err in errors:
                print(f"  - {err}")
            sys.exit(1)
        print("PASS: Checksum integrity verified.")

    # 2. Load Manifest
    with open(args.manifest, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    docs = manifest.get("documents", [])
    print(f"Evaluating {len(docs)} documents from {args.manifest}...")

    # 3. Execute evaluation
    report = evaluate_corpus(
        docs,
        pipeline_runner_fn=None,
        allow_unmasked_synthetic=args.debug_unmasked_synthetic_only
    )

    # 4. Save artifacts
    os.makedirs(args.output_dir, exist_ok=True)
    json_path = os.path.join(args.output_dir, "held_out_metrics.json")
    md_path = os.path.join(args.output_dir, "HELD_OUT_BENCHMARK_REPORT.md")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    md_content = generate_markdown_report(report)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print(f"Success! Reports saved to:\n  - {json_path}\n  - {md_path}")


if __name__ == "__main__":
    main()
