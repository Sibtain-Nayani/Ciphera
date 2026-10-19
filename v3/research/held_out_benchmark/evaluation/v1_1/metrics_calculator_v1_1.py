"""
Metrics Calculator Module (Evaluator v1.1 - Stage 7A.1)

Author: Google Deepmind Agentic Coding Team
Version: 1.1.1-held-out-evaluator
Sealed Against: f77567d3d7b5106895305f64a1aee6aeed635692

Audit Corrections in v1.1.1:
1. Correct Clean-Document False Rejection Rate (FRR) Semantics:
   - Evaluated strictly using the verifier's actual rejection outcome (verifier_rejected is True).
   - Never infers rejection from artifact_residual_leak.
   - If verifier_rejected is None, records clean_docs_unknown_rejection_status and computes
     FRR over known-status clean documents only.
   - Residual artifact leakage on clean documents is tracked as a completely separate safety metric.
2. Conventional Duplicate-Aware False Positive Accounting:
   - All unmatched predictions (including duplicates) are counted in conventional false positives (fp).
   - Primary precision, recall, and F1 strictly use conventional false positives.
   - Duplicate predictions are isolated and reported separately under 'dups'.
   - Deduplicated metrics are explicitly labeled as diagnostic only ('precision_deduplicated_diagnostic').
"""

from typing import List, Dict, Any, Optional


CORE_ANNOTATED_PII_CLASSES = {
    "AADHAAR_NUMBER",
    "BANK_ACCOUNT",
    "DATE_OF_BIRTH",
    "EMAIL_ADDRESS",
    "IFSC_CODE",
    "PAN_NUMBER",
    "PASSPORT_NUMBER",
    "PHONE_NUMBER",
    "VOTER_ID"
}


def compute_precision_recall_f1(tp: int, fp: int, fn: int) -> Dict[str, Optional[float]]:
    """Calculates precision, recall, and F1 score with safe division."""
    precision = float(tp) / float(tp + fp) if (tp + fp) > 0 else (0.0 if fn > 0 or fp > 0 else None)
    recall = float(tp) / float(tp + fn) if (tp + fn) > 0 else None

    if precision is not None and recall is not None and (precision + recall) > 0:
        f1 = (2.0 * precision * recall) / (precision + recall)
    elif precision == 0.0 or recall == 0.0:
        f1 = 0.0
    else:
        f1 = None

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1
    }


def calculate_entity_counts(
    expected_list: List[Dict[str, Any]],
    detected_list: List[Dict[str, Any]]
) -> Dict[str, int]:
    """
    Calculates entity counts under conventional evaluation rules.
    All unassigned detections are counted in 'fp' (conventional false positives).
    Duplicates are tracked separately under 'dups'.
    """
    tp = sum(1 for e in expected_list if e.get("matched_by") is not None)
    tp_exact = sum(1 for e in expected_list if e.get("matched_by") is not None and e.get("is_exact_match", False))
    incomplete_tp = sum(1 for e in expected_list if e.get("matched_by") is not None and e.get("incomplete_span", False))
    fn = sum(1 for e in expected_list if e.get("matched_by") is None)
    
    # Conventional accounting: ALL unmatched detections are false positives
    fp_conventional = sum(1 for d in detected_list if d.get("matched_to") is None)
    
    # Diagnostic duplicate tracking: unmatched detections that overlap an already-matched detection
    dups = sum(1 for d in detected_list if d.get("matched_to") is None and d.get("duplicate_of") is not None)
    fp_unique_diagnostic = fp_conventional - dups

    return {
        "tp": tp,
        "tp_exact": tp_exact,
        "incomplete_tp": incomplete_tp,
        "fn": fn,
        "fp": fp_conventional,
        "dups": dups,
        "fp_unique_diagnostic": fp_unique_diagnostic
    }


def calculate_per_class_metrics(
    all_expected: List[Dict[str, Any]],
    all_detected: List[Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """Calculates metrics per entity class across an entire evaluated corpus."""
    classes = sorted(list(set(
        [e["type"] for e in all_expected if e.get("type")] +
        [d["type"] for d in all_detected if d.get("type")]
    )))
    results = {}

    for cls in classes:
        cls_exp = [e for e in all_expected if e.get("type") == cls]
        cls_det = [d for d in all_detected if d.get("type") == cls]
        
        counts = calculate_entity_counts(cls_exp, cls_det)
        prf_conventional = compute_precision_recall_f1(counts["tp"], counts["fp"], counts["fn"])
        prf_dedup = compute_precision_recall_f1(counts["tp"], counts["fp_unique_diagnostic"], counts["fn"])
        
        exact_ratio = (float(counts["tp_exact"]) / float(counts["tp"])) if counts["tp"] > 0 else None
        
        results[cls] = {
            **counts,
            **prf_conventional,
            "precision_deduplicated_diagnostic": prf_dedup["precision"],
            "f1_deduplicated_diagnostic": prf_dedup["f1"],
            "exact_span_ratio": exact_ratio,
            "is_core_annotated_class": (cls in CORE_ANNOTATED_PII_CLASSES)
        }

    return results


def calculate_aggregate_metrics_v1_1(
    document_results: List[Dict[str, Any]],
    clean_documents: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Computes aggregate metrics for Evaluator v1.1.
    """
    all_expected = []
    all_detected = []
    
    docs_with_pii = 0
    docs_with_detection_leak = 0
    docs_with_artifact_residual_leak = 0
    docs_rejected_by_verifier = 0

    for doc in document_results:
        exp = doc.get("expected", [])
        det = doc.get("detected", [])
        all_expected.extend(exp)
        all_detected.extend(det)

        if len(exp) > 0:
            docs_with_pii += 1
            has_fn = any(e.get("matched_by") is None for e in exp)
            has_incomplete = any(e.get("incomplete_span", False) for e in exp)
            if has_fn or has_incomplete:
                docs_with_detection_leak += 1

            if doc.get("artifact_residual_leak") is True:
                docs_with_artifact_residual_leak += 1

            if doc.get("verifier_rejected") is True:
                docs_rejected_by_verifier += 1

    # Micro counts under conventional accounting
    total_counts = calculate_entity_counts(all_expected, all_detected)
    micro_prf = compute_precision_recall_f1(total_counts["tp"], total_counts["fp"], total_counts["fn"])
    micro_dedup_prf = compute_precision_recall_f1(total_counts["tp"], total_counts["fp_unique_diagnostic"], total_counts["fn"])
    
    exact_span_ratio = (
        float(total_counts["tp_exact"]) / float(total_counts["tp"])
        if total_counts["tp"] > 0 else None
    )
    incomplete_span_ratio = (
        float(total_counts["incomplete_tp"]) / float(total_counts["tp"])
        if total_counts["tp"] > 0 else None
    )

    # Class breakdown
    class_metrics = calculate_per_class_metrics(all_expected, all_detected)

    # Macro averaging: Comprehensive across all evaluated classes
    valid_precisions = [m["precision"] for m in class_metrics.values() if m["precision"] is not None]
    valid_recalls = [m["recall"] for m in class_metrics.values() if m["recall"] is not None]
    valid_f1s = [m["f1"] for m in class_metrics.values() if m["f1"] is not None]

    macro_precision = sum(valid_precisions) / len(valid_precisions) if valid_precisions else None
    macro_recall = sum(valid_recalls) / len(valid_recalls) if valid_recalls else None
    macro_f1 = sum(valid_f1s) / len(valid_f1s) if valid_f1s else None

    # Macro averaging: Core Target PII classes only
    core_classes = [c for c, m in class_metrics.items() if m.get("is_core_annotated_class")]
    core_p = [class_metrics[c]["precision"] for c in core_classes if class_metrics[c]["precision"] is not None]
    core_r = [class_metrics[c]["recall"] for c in core_classes if class_metrics[c]["recall"] is not None]
    core_f = [class_metrics[c]["f1"] for c in core_classes if class_metrics[c]["f1"] is not None]

    core_macro_precision = sum(core_p) / len(core_p) if core_p else None
    core_macro_recall = sum(core_r) / len(core_r) if core_r else None
    core_macro_f1 = sum(core_f) / len(core_f) if core_f else None

    # PII Document-Level Leak Rates
    detection_doc_leak_rate = (
        float(docs_with_detection_leak) / float(docs_with_pii)
        if docs_with_pii > 0 else None
    )
    artifact_residual_doc_leak_rate = (
        float(docs_with_artifact_residual_leak) / float(docs_with_pii)
        if docs_with_pii > 0 else None
    )
    pii_docs_verifier_rejection_rate = (
        float(docs_rejected_by_verifier) / float(docs_with_pii)
        if docs_with_pii > 0 else None
    )

    # Clean Documents (Hard Negatives) Evaluation with strict FRR semantics
    clean_doc_metrics = {}
    if clean_documents is not None:
        n_clean = len(clean_documents)
        clean_with_fp = 0
        clean_rejected_by_verifier = 0
        clean_accepted_by_verifier = 0
        clean_unknown_rejection_status = 0
        clean_with_residual_leaks = 0
        total_clean_fps = 0

        for cd in clean_documents:
            det = cd.get("detected", [])
            # Conventional false positives
            clean_fps = [d for d in det if d.get("matched_to") is None]
            if len(clean_fps) > 0:
                clean_with_fp += 1
                total_clean_fps += len(clean_fps)
            
            # Strict verifier rejection evaluation
            v_rejected = cd.get("verifier_rejected")
            if v_rejected is True:
                clean_rejected_by_verifier += 1
            elif v_rejected is False:
                clean_accepted_by_verifier += 1
            else:
                clean_unknown_rejection_status += 1

            # Separate residual leak safety tracking
            if cd.get("artifact_residual_leak") is True:
                clean_with_residual_leaks += 1

        known_status_clean_docs = clean_rejected_by_verifier + clean_accepted_by_verifier
        
        # Clean False Rejection Rate calculated strictly over known-status clean documents
        clean_doc_false_rejection_rate = (
            float(clean_rejected_by_verifier) / float(known_status_clean_docs)
            if known_status_clean_docs > 0 else None
        )
        clean_doc_false_alarm_rate = (
            float(clean_with_fp) / float(n_clean) if n_clean > 0 else None
        )
        clean_doc_residual_leak_rate = (
            float(clean_with_residual_leaks) / float(n_clean) if n_clean > 0 else None
        )

        clean_doc_metrics = {
            "total_clean_docs": n_clean,
            "clean_docs_with_false_positives": clean_with_fp,
            "total_false_positives_in_clean_docs": total_clean_fps,
            "clean_doc_false_alarm_rate": clean_doc_false_alarm_rate,
            "clean_docs_rejected_by_verifier": clean_rejected_by_verifier,
            "clean_docs_accepted_by_verifier": clean_accepted_by_verifier,
            "clean_docs_unknown_rejection_status": clean_unknown_rejection_status,
            "clean_docs_evaluated_for_rejection": known_status_clean_docs,
            "clean_doc_false_rejection_rate": clean_doc_false_rejection_rate,
            "clean_docs_with_residual_leaks": clean_with_residual_leaks,
            "clean_doc_residual_leak_rate": clean_doc_residual_leak_rate
        }

    return {
        "micro": {
            **total_counts,
            **micro_prf,
            "precision_deduplicated_diagnostic": micro_dedup_prf["precision"],
            "f1_deduplicated_diagnostic": micro_dedup_prf["f1"],
            "exact_span_ratio": exact_span_ratio,
            "incomplete_span_ratio": incomplete_span_ratio
        },
        "macro_comprehensive": {
            "total_evaluated_classes": len(class_metrics),
            "precision_classes_count": len(valid_precisions),
            "recall_classes_count": len(valid_recalls),
            "f1_classes_count": len(valid_f1s),
            "macro_precision": macro_precision,
            "macro_recall": macro_recall,
            "macro_f1": macro_f1
        },
        "macro_core": {
            "core_classes_count": len(core_classes),
            "precision_classes_count": len(core_p),
            "recall_classes_count": len(core_r),
            "f1_classes_count": len(core_f),
            "macro_precision": core_macro_precision,
            "macro_recall": core_macro_recall,
            "macro_f1": core_macro_f1
        },
        "privacy_leakage": {
            "eligible_pii_docs_count": docs_with_pii,
            "docs_with_detection_leak": docs_with_detection_leak,
            "detection_document_leak_rate": detection_doc_leak_rate,
            "docs_with_artifact_residual_leak": docs_with_artifact_residual_leak,
            "artifact_residual_doc_leak_rate": artifact_residual_doc_leak_rate,
            "pii_docs_rejected_by_verifier": docs_rejected_by_verifier,
            "pii_docs_verifier_rejection_rate": pii_docs_verifier_rejection_rate
        },
        "clean_documents": clean_doc_metrics,
        "per_class": class_metrics
    }
