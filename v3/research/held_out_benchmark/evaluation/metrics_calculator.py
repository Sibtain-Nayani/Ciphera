"""
Metrics Calculator for Ciphera Held-Out Benchmark
Computes entity-level, document-level, and verifier-level metrics with explicit
handling of empty denominators and macro/micro aggregation rules.
"""

from typing import List, Dict, Any, Optional


def calculate_entity_counts(expected_list: List[Dict[str, Any]], detected_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes base classification counts for a matched set of entities.
    """
    tp = sum(1 for e in expected_list if e.get("matched_by") is not None)
    tp_exact = sum(1 for e in expected_list if e.get("matched_by") is not None and e.get("is_exact_match", False))
    incomplete_tp = sum(1 for e in expected_list if e.get("matched_by") is not None and e.get("incomplete_span", False))
    fn = sum(1 for e in expected_list if e.get("matched_by") is None)
    
    # False positives are detections that matched NO expected entity
    fp = sum(1 for d in detected_list if d.get("matched_to") is None)
    dups = sum(1 for d in detected_list if d.get("duplicate_of") is not None)

    return {
        "tp": tp,
        "tp_exact": tp_exact,
        "incomplete_tp": incomplete_tp,
        "fn": fn,
        "fp": fp,
        "dups": dups
    }


def compute_precision_recall_f1(tp: int, fp: int, fn: int) -> Dict[str, Optional[float]]:
    """
    Computes Precision, Recall, and F1 with strict handling of empty denominators.
    If denominator is 0, metric is None (N/A) rather than an arbitrary 1.0 or 0.0.
    """
    precision = float(tp) / float(tp + fp) if (tp + fp) > 0 else None
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


def calculate_per_class_metrics(
    all_expected: List[Dict[str, Any]],
    all_detected: List[Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """
    Calculates metrics per entity class across an entire evaluated corpus.
    Only classes present in ground truth or predictions are considered.
    """
    classes = sorted(list(set(
        [e["type"] for e in all_expected] + [d["type"] for d in all_detected]
    )))
    results = {}

    for cls in classes:
        cls_exp = [e for e in all_expected if e["type"] == cls]
        cls_det = [d for d in all_detected if d["type"] == cls]
        
        counts = calculate_entity_counts(cls_exp, cls_det)
        prf = compute_precision_recall_f1(counts["tp"], counts["fp"], counts["fn"])
        
        exact_ratio = (float(counts["tp_exact"]) / float(counts["tp"])) if counts["tp"] > 0 else None
        
        results[cls] = {
            **counts,
            **prf,
            "exact_span_ratio": exact_ratio
        }

    return results


def calculate_aggregate_metrics(
    document_results: List[Dict[str, Any]],
    clean_documents: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Computes macro, micro, and document-level privacy leakage metrics.
    
    document_results: list of dicts with:
      - 'id': str
      - 'expected': list of matched expected entities
      - 'detected': list of matched detected entities
      - 'artifact_residual_leak': bool (optional, for final artifact leakage)
      
    clean_documents: documents that contain 0 ground-truth entities (hard negatives),
                     evaluated strictly for false alarms without recall distortion.
    """
    all_expected = []
    all_detected = []
    
    docs_with_pii = 0
    docs_with_detection_leak = 0
    docs_with_artifact_residual_leak = 0

    for doc in document_results:
        exp = doc.get("expected", [])
        det = doc.get("detected", [])
        all_expected.extend(exp)
        all_detected.extend(det)

        if len(exp) > 0:
            docs_with_pii += 1
            # A document has a detection leak if any ground-truth entity was missed (FN > 0)
            # or if any matched entity had incomplete redaction leaving residual chars
            has_fn = any(e.get("matched_by") is None for e in exp)
            if has_fn:
                docs_with_detection_leak += 1

            if doc.get("artifact_residual_leak", False):
                docs_with_artifact_residual_leak += 1

    # Micro counts
    total_counts = calculate_entity_counts(all_expected, all_detected)
    micro_prf = compute_precision_recall_f1(total_counts["tp"], total_counts["fp"], total_counts["fn"])
    exact_span_ratio = (
        float(total_counts["tp_exact"]) / float(total_counts["tp"])
        if total_counts["tp"] > 0 else None
    )
    incomplete_span_ratio = (
        float(total_counts["incomplete_tp"]) / float(total_counts["tp"])
        if total_counts["tp"] > 0 else None
    )

    # Class breakdown and Macro metrics
    class_metrics = calculate_per_class_metrics(all_expected, all_detected)
    
    # Macro averaging: average only over eligible classes (where metric is not None)
    valid_precisions = [m["precision"] for m in class_metrics.values() if m["precision"] is not None]
    valid_recalls = [m["recall"] for m in class_metrics.values() if m["recall"] is not None]
    valid_f1s = [m["f1"] for m in class_metrics.values() if m["f1"] is not None]

    macro_precision = sum(valid_precisions) / len(valid_precisions) if valid_precisions else None
    macro_recall = sum(valid_recalls) / len(valid_recalls) if valid_recalls else None
    macro_f1 = sum(valid_f1s) / len(valid_f1s) if valid_f1s else None

    # Document-Level Leak Rates
    detection_doc_leak_rate = (
        float(docs_with_detection_leak) / float(docs_with_pii)
        if docs_with_pii > 0 else None
    )
    artifact_residual_doc_leak_rate = (
        float(docs_with_artifact_residual_leak) / float(docs_with_pii)
        if docs_with_pii > 0 else None
    )

    # Clean Documents (Hard Negatives) Evaluation
    clean_doc_metrics = {}
    if clean_documents is not None:
        n_clean = len(clean_documents)
        clean_with_fp = 0
        clean_rejected_by_verifier = 0
        total_clean_fps = 0

        for cd in clean_documents:
            det = cd.get("detected", [])
            if len(det) > 0:
                clean_with_fp += 1
                total_clean_fps += len(det)
            if cd.get("verifier_rejected", False):
                clean_rejected_by_verifier += 1

        clean_doc_false_alarm_rate = (
            float(clean_with_fp) / float(n_clean) if n_clean > 0 else None
        )
        clean_doc_false_rejection_rate = (
            float(clean_rejected_by_verifier) / float(n_clean) if n_clean > 0 else None
        )

        clean_doc_metrics = {
            "total_clean_docs": n_clean,
            "clean_docs_with_false_positives": clean_with_fp,
            "total_false_positives_in_clean_docs": total_clean_fps,
            "clean_doc_false_alarm_rate": clean_doc_false_alarm_rate,
            "clean_doc_false_rejection_rate": clean_doc_false_rejection_rate
        }

    return {
        "micro": {
            **total_counts,
            **micro_prf,
            "exact_span_ratio": exact_span_ratio,
            "incomplete_span_ratio": incomplete_span_ratio
        },
        "macro": {
            "eligible_classes_count": len(class_metrics),
            "precision": macro_precision,
            "recall": macro_recall,
            "f1": macro_f1
        },
        "privacy_leakage": {
            "eligible_pii_docs_count": docs_with_pii,
            "docs_with_detection_leak": docs_with_detection_leak,
            "detection_document_leak_rate": detection_doc_leak_rate,
            "docs_with_artifact_residual_leak": docs_with_artifact_residual_leak,
            "artifact_residual_doc_leak_rate": artifact_residual_doc_leak_rate
        },
        "clean_documents": clean_doc_metrics,
        "per_class": class_metrics
    }
