"""
Privacy-Preserving Report Generator (Evaluator v1.1 - Stage 7A.1)

Author: Google Deepmind Agentic Coding Team
Version: 1.1.1-held-out-evaluator
Sealed Against: f77567d3d7b5106895305f64a1aee6aeed635692
"""

import os
import json
from typing import Dict, List, Any, Optional


def sanitize_diagnostic_entries_v1_1(
    document_results: List[Dict[str, Any]],
    allow_unmasked_synthetic: bool = False
) -> List[Dict[str, Any]]:
    """Sanitizes diagnostic entries while recording match channel, method, and failure taxonomy."""
    diagnostics = []

    for doc in document_results:
        doc_id = doc.get("id", "unknown_doc")
        is_synthetic = doc.get("is_synthetic", True)
        can_unmask = allow_unmasked_synthetic and is_synthetic

        exp_list = doc.get("expected", [])
        det_list = doc.get("detected", [])

        # False Negatives
        for e in exp_list:
            if e.get("matched_by") is None:
                diagnostics.append({
                    "doc_id": doc_id,
                    "error_type": "FALSE_NEGATIVE",
                    "entity_id": e.get("id"),
                    "entity_type": e.get("type"),
                    "page_num": e.get("page_num", 1),
                    "channel": e.get("match_channel", "digital_span"),
                    "value": e.get("value") if can_unmask else "[REDACTED_BY_EVALUATOR]",
                    "residual_characters": e.get("residual_characters"),
                    "rejection_notes": e.get("rejection_diagnostics", [])
                })
            elif e.get("incomplete_span", False):
                diagnostics.append({
                    "doc_id": doc_id,
                    "error_type": "INCOMPLETE_REDACTION",
                    "entity_id": e.get("id"),
                    "entity_type": e.get("type"),
                    "page_num": e.get("page_num", 1),
                    "channel": e.get("match_channel", "digital_span"),
                    "match_method": e.get("match_method"),
                    "value": e.get("value") if can_unmask else "[REDACTED_BY_EVALUATOR]",
                    "residual_characters": e.get("residual_characters")
                })

        # False Positives
        for d in det_list:
            if d.get("matched_to") is None:
                diagnostics.append({
                    "doc_id": doc_id,
                    "error_type": "FALSE_POSITIVE",
                    "entity_id": d.get("id"),
                    "entity_type": d.get("type"),
                    "page_num": d.get("page_num", 1),
                    "value": d.get("value") if can_unmask else "[REDACTED_BY_EVALUATOR]",
                    "is_duplicate": (d.get("duplicate_of") is not None),
                    "duplicate_of_target": d.get("duplicate_of")
                })

    return diagnostics


def generate_json_report_v1_1(
    summary_metrics: Dict[str, Any],
    document_results: List[Dict[str, Any]],
    run_metadata: Dict[str, Any],
    allow_unmasked_synthetic: bool = False
) -> Dict[str, Any]:
    """Constructs complete JSON audit report payload for Evaluator v1.1."""
    diagnostics = sanitize_diagnostic_entries_v1_1(document_results, allow_unmasked_synthetic)

    return {
        "evaluator_version": "1.1.1-held-out-evaluator",
        "run_metadata": run_metadata,
        "metrics": summary_metrics,
        "diagnostics_count": len(diagnostics),
        "diagnostics": diagnostics,
        "safety_audit_notice": {
            "scanned_documents_status": "UNRESOLVED_SAFETY_FAILURE",
            "notes": "Degraded scanned documents require independent visual/OCR verification certification before release authorization."
        }
    }


def generate_markdown_report_v1_1(
    json_report: Dict[str, Any]
) -> str:
    """Generates human-readable Markdown summary report without raw PII."""
    meta = json_report.get("run_metadata", {})
    metrics = json_report.get("metrics", {})
    micro = metrics.get("micro", {})
    macro_core = metrics.get("macro_core", {})
    macro_all = metrics.get("macro_comprehensive", {})
    leak = metrics.get("privacy_leakage", {})
    clean = metrics.get("clean_documents", {})
    per_class = metrics.get("per_class", {})

    def fmt(v: Optional[float], default: str = "N/A") -> str:
        return f"{v:.4f}" if v is not None else default

    lines = [
        "# Ciphera Held-Out Benchmark Evaluation Report (Evaluator v1.1)",
        "",
        f"**Evaluator Version:** `{json_report.get('evaluator_version', '1.1.1')}`  ",
        f"**Run Timestamp:** {meta.get('timestamp', 'N/A')}  ",
        f"**Git Commit SHA:** `{meta.get('git_commit', 'N/A')}` ({meta.get('git_status', 'clean')})  ",
        f"**Python Version:** {meta.get('python_version', 'N/A')}  ",
        "",
        "> [!IMPORTANT]",
        "> **Safety Status on Degraded Scanned Documents:** Formally logged as **UNRESOLVED SAFETY FAILURE** until visual verification on rasterized PDFs is independently validated.",
        "",
        "---",
        "## 1. Overall System Performance Summary",
        "",
        "| Evaluation Metric | Value | Reference / Notes |",
        "| :--- | :---: | :--- |",
        f"| **Micro Precision (Conventional)** | {fmt(micro.get('precision'))} | TP / (TP + FP_conventional) |",
        f"| **Micro Precision (Diagnostic Deduplicated)** | {fmt(micro.get('precision_deduplicated_diagnostic'))} | Diagnostic metric ignoring duplicate detections |",
        f"| **Micro Recall** | {fmt(micro.get('recall'))} | TP / (TP + FN) |",
        f"| **Micro F1 Score (Conventional)** | {fmt(micro.get('f1'))} | Harmonic mean |",
        f"| **Total Unassigned Predictions (FP)** | {micro.get('fp', 0)} | Includes {micro.get('dups', 0)} overlapping duplicate predictions |",
        f"| **Exact-Span Ratio** | {fmt(micro.get('exact_span_ratio'))} | Proportion matching exact bounds |",
        f"| **Incomplete Span Ratio** | {fmt(micro.get('incomplete_span_ratio'))} | Proportion with residual characters |",
        f"| **Core Macro Precision (9 Target Classes)** | {fmt(macro_core.get('macro_precision'))} | Target annotated PII classes only |",
        f"| **Core Macro Recall (9 Target Classes)** | {fmt(macro_core.get('macro_recall'))} | Target annotated PII classes only |",
        f"| **Core Macro F1 (9 Target Classes)** | {fmt(macro_core.get('macro_f1'))} | Target annotated PII classes only |",
        f"| **Comprehensive Macro Precision** | {fmt(macro_all.get('macro_precision'))} | Averaged over {macro_all.get('precision_classes_count', 0)} predicted classes |",
        f"| **Comprehensive Macro Recall** | {fmt(macro_all.get('macro_recall'))} | Averaged over {macro_all.get('recall_classes_count', 0)} annotated classes |",
        f"| **Comprehensive Macro F1** | {fmt(macro_all.get('macro_f1'))} | Averaged over all {macro_all.get('total_evaluated_classes', 0)} classes |",
        f"| **Detection Document Leak Rate** | {fmt(leak.get('detection_document_leak_rate'))} | Documents with missed PII |",
        f"| **Post-Redaction Verifier Block Rate (PII)** | {fmt(leak.get('pii_docs_verifier_rejection_rate'))} | PII documents blocked from client release |",
        "",
        "---",
        "## 2. Clean Document (Hard Negatives) Performance & False Rejection Rate",
        "",
        f"- **Total Clean Documents:** {clean.get('total_clean_docs', 0)}",
        f"- **Clean Documents with False Positives:** {clean.get('clean_docs_with_false_positives', 0)}",
        f"- **Clean Document False-Alarm Rate:** {fmt(clean.get('clean_doc_false_alarm_rate'))}",
        f"- **Clean Documents Evaluated for Rejection:** {clean.get('clean_docs_evaluated_for_rejection', 0)} (Unknown: {clean.get('clean_docs_unknown_rejection_status', 0)})",
        f"- **Clean Documents Rejected by Verifier:** {clean.get('clean_docs_rejected_by_verifier', 0)}",
        f"- **Clean Documents Accepted by Verifier:** {clean.get('clean_docs_accepted_by_verifier', 0)}",
        f"- **Clean Document False-Rejection Rate (FRR):** {fmt(clean.get('clean_doc_false_rejection_rate'))} (Rejections / Known Evaluated)",
        f"- **Clean Documents with Residual Leaks:** {clean.get('clean_docs_with_residual_leaks', 0)} (Residual Leak Rate: {fmt(clean.get('clean_doc_residual_leak_rate'))})",
        "",
        "---",
        "## 3. Per-Class Entity Performance Breakdown",
        "",
        "| Entity Class | Core? | TP | Conventional FP | Dups | FN | Conventional Precision | Deduplicated Precision | Recall | F1 Score |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |"
    ]

    for cls, m in sorted(per_class.items()):
        core_mark = "YES" if m.get("is_core_annotated_class") else "NO"
        p_str = f"{m.get('precision'):.4f}" if m.get("precision") is not None else "N/A"
        p_dedup = f"{m.get('precision_deduplicated_diagnostic'):.4f}" if m.get("precision_deduplicated_diagnostic") is not None else "N/A"
        r_str = f"{m.get('recall'):.4f}" if m.get("recall") is not None else "N/A"
        f_str = f"{m.get('f1'):.4f}" if m.get("f1") is not None else "N/A"
        lines.append(f"| `{cls}` | {core_mark} | {m.get('tp')} | {m.get('fp')} | {m.get('dups', 0)} | {m.get('fn')} | {p_str} | {p_dedup} | {r_str} | {f_str} |")

    lines.extend([
        "",
        "---",
        "## 4. Privacy Notice",
        "> [!NOTE]",
        "> All raw entity strings are sanitized to `[REDACTED_BY_EVALUATOR]` in compliance with audit safety protocols."
    ])

    return "\n".join(lines)
