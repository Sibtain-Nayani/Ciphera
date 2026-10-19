"""
Master Evaluation Harness (Evaluator v1.1)

Author: Google Deepmind Agentic Coding Team
Version: 1.1.0-held-out-evaluator
Sealed Against: f77567d3d7b5106895305f64a1aee6aeed635692
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import List, Dict, Any, Optional

from .matching_v1_1 import match_entities_bipartite_v1_1
from .metrics_calculator_v1_1 import calculate_aggregate_metrics_v1_1
from .report_generator_v1_1 import generate_json_report_v1_1, generate_markdown_report_v1_1


def evaluate_corpus_v1_1(
    corpus_documents: List[Dict[str, Any]],
    pipeline_runner_fn=None,
    allow_unmasked_synthetic: bool = False,
    char_iou_threshold: float = 0.50,
    spatial_iou_threshold: float = 0.40,
    max_edit_distance: int = 2
) -> Dict[str, Any]:
    """
    Evaluates a collection of documents under Evaluator v1.1 rules.
    """
    pii_documents = []
    clean_documents = []

    for doc in corpus_documents:
        doc_id = doc.get("id", "doc_unknown")
        expected_raw = doc.get("expected_entities", [])
        detected_raw = doc.get("detected_entities", [])

        # Format expected entities
        expected = []
        for idx, e in enumerate(expected_raw):
            expected.append({
                "id": e.get("id", f"{doc_id}_exp_{idx+1:03d}"),
                "type": e.get("type") or e.get("entity_type"),
                "value": e.get("value") or e.get("text", ""),
                "start": e.get("start"),
                "end": e.get("end"),
                "page_num": e.get("page_num", 1),
                "bbox": e.get("bbox"),
                "is_ocr_derived": e.get("is_ocr_derived", False)
            })

        # Format detected entities
        detected = []
        for j, d in enumerate(detected_raw):
            detected.append({
                "id": d.get("id", f"{doc_id}_det_{j+1:03d}"),
                "type": d.get("type") or d.get("entity_type"),
                "value": d.get("value") or d.get("text", ""),
                "start": d.get("start"),
                "end": d.get("end"),
                "page_num": d.get("page_num", 1),
                "bbox": d.get("bbox")
            })

        # Run Dual-Channel Matching
        matched_expected, matched_detected = match_entities_bipartite_v1_1(
            expected,
            detected,
            char_iou_threshold=char_iou_threshold,
            spatial_iou_threshold=spatial_iou_threshold,
            max_edit_distance=max_edit_distance
        )

        doc_record = {
            "id": doc_id,
            "category": doc.get("category", "unknown"),
            "tier": doc.get("tier", "unknown"),
            "is_synthetic": doc.get("metadata", {}).get("is_synthetic", True),
            "expected": matched_expected,
            "detected": matched_detected,
            "artifact_residual_leak": doc.get("artifact_residual_leak", False),
            "verifier_rejected": doc.get("verifier_rejected", doc.get("artifact_residual_leak", False)),
            "verification_error": doc.get("verification_error")
        }

        if len(expected) > 0:
            pii_documents.append(doc_record)
        else:
            clean_documents.append(doc_record)

    # Compute aggregate metrics
    metrics = calculate_aggregate_metrics_v1_1(pii_documents, clean_documents)

    run_meta = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "python_version": sys.version.split()[0],
        "evaluator_version": "1.1.0-held-out-evaluator",
        "total_documents_evaluated": len(corpus_documents),
        "pii_bearing_documents_count": len(pii_documents),
        "clean_documents_count": len(clean_documents)
    }

    all_doc_records = pii_documents + clean_documents
    report_json = generate_json_report_v1_1(
        metrics,
        all_doc_records,
        run_meta,
        allow_unmasked_synthetic=allow_unmasked_synthetic
    )

    return report_json
