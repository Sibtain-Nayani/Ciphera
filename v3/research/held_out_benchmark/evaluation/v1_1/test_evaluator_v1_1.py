"""
Comprehensive Adversarial Unit Test Suite for Evaluator v1.1 (Stage 7A.1)

Author: Google Deepmind Agentic Coding Team
Version: 1.1.1-held-out-evaluator
Sealed Against: f77567d3d7b5106895305f64a1aee6aeed635692

Test Matrix:
1. Native Digital Regression (Exact & Overlap Spans)
2. Shifted OCR Offsets with Valid 2D Bounding Boxes
3. Missing, Malformed, and Inconsistent Coordinates (Negative, NaN, Inverted)
4. Page-Aware Matching (Same Coordinates on Different Pages)
5. Conservative OCR Character Confusion & Rejection of Distinct Identifiers
6. Adversarial Fragmented OCR Merging:
   - Clean 2-fragment merger
   - Clean 3-fragment merger
   - Neighbor Protection: Merger rejected when fragment absorbs neighboring entity
   - Ambiguity Protection: Merger rejected when competing entity is nearby
7. Adjacent Table Cells with Different Identifiers (Collision Gating)
8. Wrong Entity Type at Matching Location
9. Multiple Competing Annotations and Predictions (Bipartite 1-to-1 Assignment)
10. Duplicate Prediction Accounting (Conventional FP vs Diagnostic Deduplication)
11. Clean-Document False Rejection Rate (FRR) Semantics & Combinations:
    - 4 rejected out of 8 produces exactly 50% FRR
    - Residual leak with accepted status does NOT count as false rejection
    - Unknown verifier rejection status handling
12. Spatially Overlapping Predictions with Materially Different Text
13. Deterministic Tie-Breaking
14. Edge Cases: Empty Ground Truth & Empty Predictions
15. Privacy-Safe Scrubbing in Reporting
"""

import unittest
from typing import Dict, Any, List

from research.held_out_benchmark.evaluation.v1_1.matching_v1_1 import (
    match_entities_bipartite_v1_1,
    calculate_1d_iou,
    calculate_2d_iou,
    calculate_ocr_aware_distance,
    normalize_bbox
)
from research.held_out_benchmark.evaluation.v1_1.metrics_calculator_v1_1 import (
    calculate_aggregate_metrics_v1_1,
    calculate_entity_counts,
    calculate_per_class_metrics
)
from research.held_out_benchmark.evaluation.v1_1.report_generator_v1_1 import (
    generate_json_report_v1_1,
    generate_markdown_report_v1_1
)
from research.held_out_benchmark.evaluation.v1_1.eval_held_out_v1_1 import (
    evaluate_corpus_v1_1
)


class TestEvaluatorV1_1_Stage7A1(unittest.TestCase):

    # =========================================================================
    # 1. Native Digital Regression
    # =========================================================================
    def test_native_digital_exact_and_overlap_matching(self):
        """Native digital text must match on character spans with exact/overlap tracking."""
        expected = [
            {"id": "e1", "type": "PAN_NUMBER", "value": "ABCDE1234F", "start": 10, "end": 20, "is_ocr_derived": False},
            {"id": "e2", "type": "PHONE_NUMBER", "value": "9876543210", "start": 50, "end": 60, "is_ocr_derived": False}
        ]
        detected = [
            {"id": "d1", "type": "PAN_NUMBER", "value": "ABCDE1234F", "start": 10, "end": 20},  # Exact
            {"id": "d2", "type": "PHONE_NUMBER", "value": "9876543210", "start": 48, "end": 60}  # Overlap: IoU = 10/12 = 0.833
        ]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected, char_iou_threshold=0.50)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 2)
        self.assertEqual(counts["tp_exact"], 1)
        self.assertEqual(counts["incomplete_tp"], 0)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(counts["fn"], 0)
        self.assertEqual(exp_res[0]["match_method"], "exact_character_span")
        self.assertEqual(exp_res[1]["match_method"], "overlap_character_span")

    # =========================================================================
    # 2. Shifted OCR Offsets with Valid 2D Bounding Boxes
    # =========================================================================
    def test_ocr_derived_shifted_offsets_with_valid_spatial_match(self):
        """When OCR offset is shifted (e.g. e.start=0 vs d.start=150), spatial 2D bbox matches."""
        expected = [{
            "id": "e_ocr_1",
            "type": "AADHAAR_NUMBER",
            "value": "9012 3456 7890",
            "start": 0,
            "end": 14,
            "page_num": 1,
            "bbox": [50.0, 100.0, 200.0, 120.0],
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_ocr_1",
            "type": "AADHAAR_NUMBER",
            "value": "9012 3456 7890",
            "start": 150,  # Offset shifted by OCR extraction
            "end": 164,
            "page_num": 1,
            "bbox": [52.0, 99.0, 198.0, 121.0]  # Overlap IoU > 0.85
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected, spatial_iou_threshold=0.40)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 1)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(counts["fn"], 0)
        self.assertEqual(exp_res[0]["match_method"], "spatial_bbox_iou")
        self.assertGreaterEqual(exp_res[0]["match_iou"], 0.80)

    # =========================================================================
    # 3. Missing, Malformed, and Inconsistent Coordinates
    # =========================================================================
    def test_missing_and_malformed_coordinates_rejection(self):
        """Negative, inverted (x0>=x1, y0>=y1), NaN, or missing bboxes must be rejected."""
        self.assertIsNone(normalize_bbox(None))
        self.assertIsNone(normalize_bbox([100, 50, 80, 70]))  # x0 > x1
        self.assertIsNone(normalize_bbox([-10, 50, 80, 70]))  # negative x0
        self.assertIsNone(normalize_bbox([50, 100, 80, 70]))  # y0 > y1
        self.assertIsNone(normalize_bbox([50, 50, float('nan'), 70]))  # NaN coordinate
        self.assertIsNone(normalize_bbox("invalid_string"))
        self.assertIsNone(normalize_bbox([50, 50, 50, 70]))   # zero width (x0 == x1)
        self.assertEqual(normalize_bbox({"x0": 10, "y0": 20, "x1": 30, "y1": 40}), [10.0, 20.0, 30.0, 40.0])

        expected = [{
            "id": "e_bad",
            "type": "PAN_NUMBER",
            "value": "ABCDE1234F",
            "page_num": 1,
            "bbox": [100, 200, 50, 220],  # Invalid x0 > x1
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_good",
            "type": "PAN_NUMBER",
            "value": "ABCDE1234F",
            "page_num": 1,
            "bbox": [50, 200, 100, 220]
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fn"], 1)
        self.assertEqual(counts["fp"], 1)

    # =========================================================================
    # 4. Page-Aware Matching
    # =========================================================================
    def test_different_pages_with_identical_coordinates_never_match(self):
        """Identical coordinates on different pages must never match."""
        expected = [{
            "id": "e_p1",
            "type": "PAN_NUMBER",
            "value": "ABCDE1234F",
            "page_num": 1,
            "bbox": [50.0, 100.0, 150.0, 120.0],
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_p2",
            "type": "PAN_NUMBER",
            "value": "ABCDE1234F",
            "page_num": 2,  # Different page!
            "bbox": [50.0, 100.0, 150.0, 120.0]
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fn"], 1)
        self.assertEqual(counts["fp"], 1)

    # =========================================================================
    # 5. Conservative OCR Character Confusion & Distinct Identifier Rejection
    # =========================================================================
    def test_ocr_character_confusion_accepted(self):
        """O/0 and I/1 confusions match with recorded rule."""
        dist, rules = calculate_ocr_aware_distance("SKRPR4410K", "SKRPR441OK")  # '0' vs 'O'
        self.assertEqual(dist, 0)
        self.assertIn("0->O", rules)

        expected = [{
            "id": "e_conf",
            "type": "PAN_NUMBER",
            "value": "SKRPR4410K",
            "page_num": 1,
            "bbox": [50, 100, 150, 120],
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_conf",
            "type": "PAN_NUMBER",
            "value": "SKRPR441OK",
            "page_num": 1,
            "bbox": [50, 100, 150, 120]
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 1)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(counts["fn"], 0)

    def test_distinct_identifiers_rejected_even_with_one_char_difference(self):
        """Non-confusion digit differences (e.g. 0 vs 1, or 4 vs 5 in short code) must not match."""
        # '0' vs '1' is NOT an OCR confusion pair
        dist, rules = calculate_ocr_aware_distance("SKRPR4410K", "SKRPR4411K")
        self.assertEqual(dist, 1)
        self.assertEqual(len(rules), 0)

        # For a short identifier of length <= 6, two edits must be strictly rejected
        expected = [{
            "id": "e_code",
            "type": "IFSC_CODE",
            "value": "SBIN001",
            "page_num": 1,
            "bbox": [50, 100, 150, 120],
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_code",
            "type": "IFSC_CODE",
            "value": "SBIN099",  # Genuinely different branch code!
            "page_num": 1,
            "bbox": [50, 100, 150, 120]
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fn"], 1)
        self.assertEqual(counts["fp"], 1)

    # =========================================================================
    # 6. Fragmented OCR Token Merging & Neighbor Protection
    # =========================================================================
    def test_fragmented_ocr_token_merging_clean_two_parts(self):
        """An identifier split into 2 adjacent OCR boxes should merge if union matches."""
        expected = [{
            "id": "e_split",
            "type": "PAN_NUMBER",
            "value": "ABCDE1234F",
            "page_num": 1,
            "bbox": [50.0, 100.0, 150.0, 120.0],
            "is_ocr_derived": True
        }]
        detected = [
            {"id": "d_part1", "type": "PAN_NUMBER", "value": "ABCDE", "page_num": 1, "bbox": [50.0, 100.0, 100.0, 120.0]},
            {"id": "d_part2", "type": "PAN_NUMBER", "value": "1234F", "page_num": 1, "bbox": [102.0, 100.0, 150.0, 120.0]}
        ]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 1)
        self.assertEqual(counts["fn"], 0)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(exp_res[0]["match_method"], "spatial_fragment_merged")

    def test_fragmented_ocr_token_merging_clean_three_parts(self):
        """Aadhaar split into 3 digit groups of 4 digits merges cleanly."""
        expected = [{
            "id": "e_aadhaar",
            "type": "AADHAAR_NUMBER",
            "value": "1234 5678 9012",
            "page_num": 1,
            "bbox": [50.0, 100.0, 200.0, 120.0],
            "is_ocr_derived": True
        }]
        detected = [
            {"id": "d1", "type": "AADHAAR_NUMBER", "value": "1234", "page_num": 1, "bbox": [50.0, 100.0, 95.0, 120.0]},
            {"id": "d2", "type": "AADHAAR_NUMBER", "value": "5678", "page_num": 1, "bbox": [100.0, 100.0, 145.0, 120.0]},
            {"id": "d3", "type": "AADHAAR_NUMBER", "value": "9012", "page_num": 1, "bbox": [150.0, 100.0, 200.0, 120.0]}
        ]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 1)
        self.assertEqual(counts["fn"], 0)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(exp_res[0]["match_method"], "spatial_fragment_merged")

    def test_fragment_merge_rejected_when_absorbing_neighboring_entity(self):
        """Merger must be strictly REJECTED if a candidate fragment overlaps a neighboring entity."""
        expected = [
            {"id": "e_target", "type": "PAN_NUMBER", "value": "ABCDE1234F", "page_num": 1, "bbox": [50.0, 100.0, 150.0, 120.0], "is_ocr_derived": True},
            {"id": "e_neighbor", "type": "PAN_NUMBER", "value": "XYZAB9876C", "page_num": 1, "bbox": [155.0, 100.0, 250.0, 120.0], "is_ocr_derived": True}
        ]
        # Candidate 2 heavily intrudes into e_neighbor's bbox
        detected = [
            {"id": "d_part1", "type": "PAN_NUMBER", "value": "ABCDE", "page_num": 1, "bbox": [50.0, 100.0, 100.0, 120.0]},
            {"id": "d_intruder", "type": "PAN_NUMBER", "value": "1234F", "page_num": 1, "bbox": [102.0, 100.0, 190.0, 120.0]} # Overlaps e_neighbor!
        ]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        # Neighbor protection prevents merging with d_intruder
        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fn"], 2)
        self.assertEqual(counts["fp"], 2)

    # =========================================================================
    # 7. Adjacent Table Cells with Different Identifiers (Collision Gating)
    # =========================================================================
    def test_adjacent_table_cells_materially_different_rejected(self):
        """Two adjacent numeric codes in a table with different values must not match."""
        expected = [{
            "id": "e_acc1",
            "type": "BANK_ACCOUNT",
            "value": "1122334455",
            "page_num": 1,
            "bbox": [50.0, 100.0, 150.0, 120.0],
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_acc2",
            "type": "BANK_ACCOUNT",
            "value": "9988776655",  # Different account number!
            "page_num": 1,
            "bbox": [55.0, 100.0, 155.0, 120.0]  # Overlapping box
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fn"], 1)
        self.assertEqual(counts["fp"], 1)

    # =========================================================================
    # 8. Wrong Entity Type at Matching Location
    # =========================================================================
    def test_wrong_entity_type_rejected_even_with_perfect_box(self):
        """Detection with wrong type must be rejected as false positive and false negative."""
        expected = [{
            "id": "e_pan",
            "type": "PAN_NUMBER",
            "value": "ABCDE1234F",
            "page_num": 1,
            "bbox": [50.0, 100.0, 150.0, 120.0],
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_wrong_type",
            "type": "PHONE_NUMBER",  # Wrong type!
            "value": "ABCDE1234F",
            "page_num": 1,
            "bbox": [50.0, 100.0, 150.0, 120.0]
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fn"], 1)
        self.assertEqual(counts["fp"], 1)

    # =========================================================================
    # 9. Multiple Competing Annotations and Predictions (Bipartite 1-to-1)
    # =========================================================================
    def test_multiple_annotations_and_predictions_optimal_bipartite(self):
        """Two expected and two detected entities matched via Kuhn-Munkres globally optimal pair."""
        expected = [
            {"id": "e1", "type": "PAN_NUMBER", "value": "ABCDE1234F", "page_num": 1, "bbox": [50, 100, 150, 120], "is_ocr_derived": True},
            {"id": "e2", "type": "PAN_NUMBER", "value": "XYZAB9876C", "page_num": 1, "bbox": [50, 200, 150, 220], "is_ocr_derived": True}
        ]
        # Detected in reverse order
        detected = [
            {"id": "d2", "type": "PAN_NUMBER", "value": "XYZAB9876C", "page_num": 1, "bbox": [50, 200, 150, 220]},
            {"id": "d1", "type": "PAN_NUMBER", "value": "ABCDE1234F", "page_num": 1, "bbox": [50, 100, 150, 120]}
        ]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 2)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(counts["fn"], 0)
        self.assertEqual(exp_res[0]["matched_by"], 1)  # e1 -> d1
        self.assertEqual(exp_res[1]["matched_by"], 0)  # e2 -> d2

    # =========================================================================
    # 10. Duplicate Prediction Accounting (Conventional vs Deduplicated)
    # =========================================================================
    def test_duplicate_prediction_conventional_accounting(self):
        """
        One annotation with 5 overlapping predictions:
        Conventional: TP=1, FP=4, precision = 1/5 = 0.2000.
        Diagnostic: TP=1, dups=4, fp_unique=0, precision_dedup = 1.0000.
        Adding duplicates strictly PENALIZES conventional precision.
        """
        expected = [
            {"id": "e1", "type": "AADHAAR_NUMBER", "value": "1234 5678 9012", "page_num": 1, "bbox": [50, 100, 200, 120], "is_ocr_derived": True}
        ]
        # 5 identical overlapping predictions
        detected = [
            {"id": f"d_{i}", "type": "AADHAAR_NUMBER", "value": "1234 5678 9012", "page_num": 1, "bbox": [50, 100, 200, 120]}
            for i in range(5)
        ]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 1)
        self.assertEqual(counts["fp"], 4)      # Conventional FP = 4
        self.assertEqual(counts["dups"], 4)    # Duplicates tracked = 4
        self.assertEqual(counts["fp_unique_diagnostic"], 0)

        # Micro metrics calculation
        doc_res = [{
            "id": "doc_dup",
            "expected": exp_res,
            "detected": det_res,
            "artifact_residual_leak": False,
            "verifier_rejected": False
        }]
        metrics = calculate_aggregate_metrics_v1_1(doc_res, [])
        micro = metrics["micro"]

        # Conventional precision must be 1 / (1 + 4) = 0.2000
        self.assertAlmostEqual(micro["precision"], 0.2000, places=4)
        # Diagnostic deduplicated precision is 1 / (1 + 0) = 1.0000
        self.assertAlmostEqual(micro["precision_deduplicated_diagnostic"], 1.0000, places=4)

    # =========================================================================
    # 11. Clean-Document False Rejection Rate (FRR) Semantics & Combinations
    # =========================================================================
    def test_clean_document_frr_strict_semantics(self):
        """
        Tests clean-document FRR:
        1. 4 rejected out of 8 clean docs produces FRR = 50.0%.
        2. A clean document with residual leak but accepted by verifier does NOT count as false rejection.
        3. Documents with unknown rejection status are excluded from FRR denominator.
        """
        # Case A: 4 rejected, 4 accepted (FRR = 4 / 8 = 50.0%)
        clean_docs_a = []
        for i in range(8):
            rejected = (i < 4)
            clean_docs_a.append({
                "id": f"clean_a_{i}",
                "expected": [],
                "detected": [],
                "verifier_rejected": rejected,
                "artifact_residual_leak": rejected
            })
        metrics_a = calculate_aggregate_metrics_v1_1([], clean_docs_a)["clean_documents"]
        self.assertEqual(metrics_a["total_clean_docs"], 8)
        self.assertEqual(metrics_a["clean_docs_rejected_by_verifier"], 4)
        self.assertEqual(metrics_a["clean_docs_accepted_by_verifier"], 4)
        self.assertAlmostEqual(metrics_a["clean_doc_false_rejection_rate"], 0.50, places=4)

        # Case B: Residual leak present, but verifier accepted document (Unblocked leak)
        # Must count as residual leak, but NOT as verifier rejection
        clean_docs_b = [
            {"id": "c1", "expected": [], "detected": [], "verifier_rejected": False, "artifact_residual_leak": True},
            {"id": "c2", "expected": [], "detected": [], "verifier_rejected": False, "artifact_residual_leak": False}
        ]
        metrics_b = calculate_aggregate_metrics_v1_1([], clean_docs_b)["clean_documents"]
        self.assertEqual(metrics_b["clean_docs_rejected_by_verifier"], 0)
        self.assertEqual(metrics_b["clean_docs_with_residual_leaks"], 1)
        self.assertAlmostEqual(metrics_b["clean_doc_false_rejection_rate"], 0.00, places=4)
        self.assertAlmostEqual(metrics_b["clean_doc_residual_leak_rate"], 0.50, places=4)

        # Case C: Unknown verifier status
        clean_docs_c = [
            {"id": "c1", "expected": [], "detected": [], "verifier_rejected": True, "artifact_residual_leak": True},
            {"id": "c2", "expected": [], "detected": [], "verifier_rejected": False, "artifact_residual_leak": False},
            {"id": "c3", "expected": [], "detected": [], "verifier_rejected": None, "artifact_residual_leak": False},
            {"id": "c4", "expected": [], "detected": [], "verifier_rejected": None, "artifact_residual_leak": False}
        ]
        metrics_c = calculate_aggregate_metrics_v1_1([], clean_docs_c)["clean_documents"]
        self.assertEqual(metrics_c["total_clean_docs"], 4)
        self.assertEqual(metrics_c["clean_docs_unknown_rejection_status"], 2)
        self.assertEqual(metrics_c["clean_docs_evaluated_for_rejection"], 2)
        # 1 rejected out of 2 known = 50.0%
        self.assertAlmostEqual(metrics_c["clean_doc_false_rejection_rate"], 0.50, places=4)

    # =========================================================================
    # 12. Spatially Overlapping Predictions with Materially Different Text
    # =========================================================================
    def test_spatially_overlapping_predictions_different_text_rejected(self):
        """Even if IoU is high (0.85), if text differs materially, match is rejected."""
        expected = [{
            "id": "e_pan",
            "type": "PAN_NUMBER",
            "value": "ABCDE1234F",
            "page_num": 1,
            "bbox": [50, 100, 150, 120],
            "is_ocr_derived": True
        }]
        detected = [{
            "id": "d_pan",
            "type": "PAN_NUMBER",
            "value": "ZXCVB9876Q",  # Completely different text!
            "page_num": 1,
            "bbox": [50, 100, 150, 120]  # Perfect bbox overlap
        }]

        exp_res, det_res = match_entities_bipartite_v1_1(expected, detected)
        counts = calculate_entity_counts(exp_res, det_res)

        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fn"], 1)
        self.assertEqual(counts["fp"], 1)

    # =========================================================================
    # 13. Deterministic Tie-Breaking
    # =========================================================================
    def test_deterministic_tie_breaking(self):
        """Identical coordinate predictions must break ties reproducibly."""
        expected = [
            {"id": "e_b", "type": "PAN_NUMBER", "start": 10, "end": 20, "is_ocr_derived": False},
            {"id": "e_a", "type": "PAN_NUMBER", "start": 10, "end": 20, "is_ocr_derived": False}
        ]
        detected = [
            {"id": "d_1", "type": "PAN_NUMBER", "start": 10, "end": 20}
        ]

        run1_e, run1_d = match_entities_bipartite_v1_1(expected, detected)
        run2_e, run2_d = match_entities_bipartite_v1_1(expected, detected)

        self.assertEqual(run1_e[0]["matched_by"], run2_e[0]["matched_by"])
        self.assertEqual(run1_e[1]["matched_by"], run2_e[1]["matched_by"])

    # =========================================================================
    # 14. Edge Cases: Empty Ground Truth & Empty Predictions
    # =========================================================================
    def test_empty_predictions_and_empty_ground_truth(self):
        """Empty expected or detected lists must execute cleanly."""
        exp_res, det_res = match_entities_bipartite_v1_1([], [])
        counts = calculate_entity_counts(exp_res, det_res)
        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(counts["fn"], 0)

        # Expected empty, detected present (All FP)
        exp_res, det_res = match_entities_bipartite_v1_1([], [{"id": "d1", "type": "PAN_NUMBER", "start": 0, "end": 10}])
        counts = calculate_entity_counts(exp_res, det_res)
        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fp"], 1)
        self.assertEqual(counts["fn"], 0)

        # Expected present, detected empty (All FN)
        exp_res, det_res = match_entities_bipartite_v1_1([{"id": "e1", "type": "PAN_NUMBER", "start": 0, "end": 10}], [])
        counts = calculate_entity_counts(exp_res, det_res)
        self.assertEqual(counts["tp"], 0)
        self.assertEqual(counts["fp"], 0)
        self.assertEqual(counts["fn"], 1)

    # =========================================================================
    # 15. Privacy-Safe Scrubbing in Reporting
    # =========================================================================
    def test_privacy_safe_scrubbing_in_reporting(self):
        """Raw PII values must be strictly masked to [REDACTED_BY_EVALUATOR]."""
        raw_pan = "SKRPR4410K"
        doc_result = [{
            "id": "leak_doc",
            "is_synthetic": True,
            "expected": [{
                "id": "e_leak",
                "type": "PAN_NUMBER",
                "value": raw_pan,
                "matched_by": None,
                "start": 0,
                "end": 10
            }],
            "detected": []
        }]

        metrics = calculate_aggregate_metrics_v1_1(doc_result, [])
        json_report = generate_json_report_v1_1(
            metrics,
            doc_result,
            {"git_commit": "abc", "timestamp": "2026-10-15"},
            allow_unmasked_synthetic=False
        )

        self.assertNotIn(raw_pan, str(json_report))
        self.assertEqual(json_report["diagnostics"][0]["value"], "[REDACTED_BY_EVALUATOR]")

        md_report = generate_markdown_report_v1_1(json_report)
        self.assertNotIn(raw_pan, md_report)
        self.assertIn("[REDACTED_BY_EVALUATOR]", md_report)


if __name__ == "__main__":
    unittest.main()
