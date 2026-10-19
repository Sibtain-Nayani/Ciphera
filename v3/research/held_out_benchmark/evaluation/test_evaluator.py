"""
Unit Test Suite for Ciphera Held-Out Benchmark Evaluator
Tests maximum-weight bipartite matching, residual character calculation,
exact-span accuracy, dual-channel OCR residual tracking, edge cases,
and privacy sanitization using controlled synthetic fixtures.
"""

import os
import tempfile
import pytest

from research.held_out_benchmark.evaluation.matching_bipartite import (
    calculate_1d_iou,
    calculate_span_intersection_length,
    solve_max_weight_bipartite,
    match_entities_bipartite,
    evaluate_residual_ocr_leak
)
from research.held_out_benchmark.evaluation.metrics_calculator import (
    calculate_entity_counts,
    compute_precision_recall_f1,
    calculate_per_class_metrics,
    calculate_aggregate_metrics
)
from research.held_out_benchmark.evaluation.report_generator import (
    generate_json_report,
    generate_markdown_report,
    sanitize_diagnostic_entries
)
from research.held_out_benchmark.evaluation.checksum_validator import (
    compute_file_sha256,
    verify_checksums
)


# =========================================================================
# 1. Bipartite Matching & Hungarian Algorithm Tests
# =========================================================================

def test_kuhn_munkres_optimal_assignment():
    """
    Verifies that the Kuhn-Munkres implementation finds the global maximum weight
    matching where a greedy approach would make a suboptimal choice.
    
    Graph setup:
      E0 can match D0 (weight 0.8)
      E1 can match D0 (weight 0.85) or D1 (weight 0.8)
      
    Greedy assignment would pick (E1, D0) with 0.85, leaving E0 unmatched (total weight = 0.85).
    Optimal assignment picks (E0, D0) and (E1, D1) (total weight = 0.8 + 0.8 = 1.6).
    """
    weight_matrix = [
        [0.80, 0.00],  # E0
        [0.85, 0.80]   # E1
    ]
    pairs = solve_max_weight_bipartite(weight_matrix)
    
    assert len(pairs) == 2
    matched_dict = dict(pairs)
    assert matched_dict[0] == 0  # E0 matched to D0
    assert matched_dict[1] == 1  # E1 matched to D1


def test_entity_type_compatibility_filter():
    """Entities with incompatible types must have 0 weight and never match."""
    expected = [{"id": "e1", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"}]
    detected = [{"id": "d1", "type": "AADHAAR", "start": 10, "end": 20, "value": "ABCDE1234F"}]

    exp_out, det_out = match_entities_bipartite(expected, detected)
    assert exp_out[0]["matched_by"] is None
    assert det_out[0]["matched_to"] is None


def test_exact_span_vs_overlap_matching():
    """Distinguishes exact span matches from partial overlap (IoU >= 0.5)."""
    expected = [
        {"id": "e1", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"},
        {"id": "e2", "type": "PAN", "start": 50, "end": 60, "value": "XYZPK9988Q"}
    ]
    detected = [
        {"id": "d1", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"},  # Exact
        {"id": "d2", "type": "PAN", "start": 48, "end": 60, "value": "XXXYZPK9988Q"} # Overlap (IoU = 10/12 = 0.833)
    ]

    exp_out, det_out = match_entities_bipartite(expected, detected)
    
    assert exp_out[0]["matched_by"] == 0
    assert exp_out[0]["is_exact_match"] is True
    
    assert exp_out[1]["matched_by"] == 1
    assert exp_out[1]["is_exact_match"] is False
    assert exp_out[1]["match_iou"] > 0.80


def test_residual_characters_from_character_intersection():
    """
    Critical Test: Verifies that residual characters are calculated from actual
    character-span intersection length, not merely string length difference.
    
    Expected span: [10, 20] (len = 10).
    Detected span A: [10, 17] (covers 7 chars -> residual = 3).
    Detected span B: [12, 22] (same length 10 as expected, but shifted:
                     intersection is [12, 20] = 8 chars -> residual = 2!).
    """
    # Case A: Truncated detection
    exp_a = [{"id": "ea", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"}]
    det_a = [{"id": "da", "type": "PAN", "start": 10, "end": 17, "value": "ABCDE12"}]
    ea_out, _ = match_entities_bipartite(exp_a, det_a)
    assert ea_out[0]["residual_characters"] == 3
    assert ea_out[0]["incomplete_span"] is True

    # Case B: Equal-length shifted detection (same length 10, but shifted by 2 chars)
    exp_b = [{"id": "eb", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"}]
    det_b = [{"id": "db", "type": "PAN", "start": 12, "end": 22, "value": "CDE1234FXX"}]
    eb_out, _ = match_entities_bipartite(exp_b, det_b)
    # Intersection is max(0, min(20, 22) - max(10, 12)) = 20 - 12 = 8 chars
    # Residual = 10 - 8 = 2 chars!
    assert eb_out[0]["residual_characters"] == 2
    assert eb_out[0]["incomplete_span"] is True


def test_duplicate_prediction_penalty():
    """
    When a detector outputs duplicate spans for the same entity, the optimal
    match gets TP and the duplicate is flagged as duplicate_of and counted as FP.
    """
    expected = [{"id": "e1", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"}]
    detected = [
        {"id": "d1", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"},
        {"id": "d2", "type": "PAN", "start": 10, "end": 20, "value": "ABCDE1234F"}
    ]

    exp_out, det_out = match_entities_bipartite(expected, detected)
    assert exp_out[0]["matched_by"] is not None
    
    # One detected is matched, one is flagged as duplicate
    matched_dets = [d for d in det_out if d["matched_to"] is not None]
    dup_dets = [d for d in det_out if d["duplicate_of"] is not None]
    
    assert len(matched_dets) == 1
    assert len(dup_dets) == 1


# =========================================================================
# 2. Dual-Channel OCR Residual Tracking Tests
# =========================================================================

def test_dual_channel_ocr_residual_tracking():
    """
    Verifies separation between confirmed exact leaks and fuzzy OCR candidate detections.
    """
    ground_truth = "ABCDE1234F"

    # Channel 1: Exact match in OCR text
    ocr_exact = "The account PAN ABCDE1234F is active."
    res_exact = evaluate_residual_ocr_leak(ground_truth, ocr_exact)
    assert res_exact["is_confirmed_leak"] is True
    assert res_exact["is_fuzzy_candidate"] is False
    assert res_exact["status"] == "CONFIRMED_LEAK"

    # Channel 2: Fuzzy match (1 character OCR confusion 'O' for '0')
    ocr_fuzzy = "The account PAN ABCDE1234O is active."
    res_fuzzy = evaluate_residual_ocr_leak(ground_truth, ocr_fuzzy)
    assert res_fuzzy["is_confirmed_leak"] is False
    assert res_fuzzy["is_fuzzy_candidate"] is True
    assert res_fuzzy["status"] == "FUZZY_CANDIDATE"
    assert res_fuzzy["edit_distance"] == 1

    # Clean text: No leak, edit distance > 1
    ocr_clean = "The account PAN XXXXXXXXXX is active."
    res_clean = evaluate_residual_ocr_leak(ground_truth, ocr_clean)
    assert res_clean["is_confirmed_leak"] is False
    assert res_clean["is_fuzzy_candidate"] is False
    assert res_clean["status"] == "CLEAN"


# =========================================================================
# 3. Metric Aggregation & Edge Case Tests
# =========================================================================

def test_empty_denominator_handling():
    """When TP=0, FP=0, FN=0, precision and recall must be None (not 1.0 or 0.0)."""
    prf = compute_precision_recall_f1(tp=0, fp=0, fn=0)
    assert prf["precision"] is None
    assert prf["recall"] is None
    assert prf["f1"] is None


def test_clean_document_isolation_no_recall_inflation():
    """
    Hard negative / clean documents (zero expected entities) must NOT inflate
    entity recall or precision. They are reported strictly under clean_documents.
    """
    pii_docs = [
        {
            "id": "doc_pii_1",
            "expected": [{"id": "e1", "type": "PAN", "matched_by": 0, "is_exact_match": True, "incomplete_span": False}],
            "detected": [{"id": "d1", "type": "PAN", "matched_to": 0, "duplicate_of": None}]
        }
    ]
    # Clean doc with 0 expected entities, but 1 false positive detection
    clean_docs = [
        {
            "id": "doc_clean_1",
            "expected": [],
            "detected": [{"id": "d_decoy", "type": "PAN", "matched_to": None, "duplicate_of": None}],
            "verifier_rejected": True
        }
    ]

    metrics = calculate_aggregate_metrics(pii_docs, clean_docs)
    
    # Entity micro metrics reflect only the PII document
    assert metrics["micro"]["tp"] == 1
    assert metrics["micro"]["fp"] == 0
    assert metrics["micro"]["fn"] == 0
    assert metrics["micro"]["precision"] == 1.0
    assert metrics["micro"]["recall"] == 1.0

    # Clean document metrics isolate the decoy false alarm
    clean_m = metrics["clean_documents"]
    assert clean_m["total_clean_docs"] == 1
    assert clean_m["clean_docs_with_false_positives"] == 1
    assert clean_m["clean_doc_false_alarm_rate"] == 1.0
    assert clean_m["clean_doc_false_rejection_rate"] == 1.0


def test_document_level_leak_rates():
    """
    Tests both Detection Document Leak Rate and Artifact Residual Leak Rate.
    """
    doc_results = [
        # Doc 1: Perfect redaction (No leaks)
        {
            "id": "doc_1",
            "expected": [{"id": "e1", "type": "PAN", "matched_by": 0, "incomplete_span": False}],
            "detected": [{"id": "d1", "type": "PAN", "matched_to": 0, "duplicate_of": None}],
            "artifact_residual_leak": False
        },
        # Doc 2: Detection missed 1 entity (FN > 0 -> Detection Leak)
        {
            "id": "doc_2",
            "expected": [
                {"id": "e2", "type": "PAN", "matched_by": 0, "incomplete_span": False},
                {"id": "e3", "type": "AADHAAR", "matched_by": None, "incomplete_span": False}
            ],
            "detected": [{"id": "d2", "type": "PAN", "matched_to": 0, "duplicate_of": None}],
            "artifact_residual_leak": True
        }
    ]

    metrics = calculate_aggregate_metrics(doc_results)
    leak_m = metrics["privacy_leakage"]
    
    assert leak_m["eligible_pii_docs_count"] == 2
    assert leak_m["docs_with_detection_leak"] == 1
    assert leak_m["detection_document_leak_rate"] == 0.50
    assert leak_m["docs_with_artifact_residual_leak"] == 1
    assert leak_m["artifact_residual_doc_leak_rate"] == 0.50


# =========================================================================
# 4. Report Privacy & Checksum Validation Tests
# =========================================================================

def test_privacy_masking_in_reports():
    """
    Verifies that raw PII values are never emitted in diagnostic reports by default.
    """
    raw_pan = "ABCDE1234F"
    doc_results = [
        {
            "id": "doc_leak",
            "is_synthetic": True,
            "expected": [{"id": "e1", "type": "PAN", "value": raw_pan, "matched_by": None, "start": 10, "end": 20}],
            "detected": []
        }
    ]

    report = generate_json_report(
        summary_metrics={"micro": {}, "macro": {}, "privacy_leakage": {}},
        document_results=doc_results,
        run_metadata={"git_commit": "abc", "timestamp": "2026-10-11"},
        allow_unmasked_synthetic=False  # Default
    )

    diag = report["diagnostics"][0]
    assert diag["value"] == "[REDACTED_BY_EVALUATOR]"
    assert raw_pan not in str(report)

    md_report = generate_markdown_report(report)
    assert raw_pan not in md_report
    assert "[REDACTED_BY_EVALUATOR]" in md_report


def test_checksum_validation_and_tampering_rejection():
    """Verifies that the checksum validator catches file modifications."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test_dataset.json")
        with open(test_file, "w") as f:
            f.write('{"data": "original"}')

        digest = compute_file_sha256(test_file)
        manifest_file = os.path.join(tmpdir, "CHECKSUMS.sha256")
        with open(manifest_file, "w") as f:
            f.write(f"{digest}  test_dataset.json\n")

        # 1. Clean verify passes
        passed, errors = verify_checksums(tmpdir, manifest_file)
        assert passed is True
        assert len(errors) == 0

        # 2. Tampered file fails
        with open(test_file, "w") as f:
            f.write('{"data": "tampered"}')

        passed_tampered, errors_tampered = verify_checksums(tmpdir, manifest_file)
        assert passed_tampered is False
        assert len(errors_tampered) == 1
        assert "Checksum mismatch" in errors_tampered[0]
