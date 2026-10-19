"""
Privacy-Preserving Report Generator
Generates JSON and Markdown evaluation reports without leaking raw PII values.
Raw ground-truth and detected strings are masked by default.
"""

import os
import json
from typing import Dict, List, Any, Optional


def sanitize_diagnostic_entries(
    document_results: List[Dict[str, Any]],
    allow_unmasked_synthetic: bool = False
) -> List[Dict[str, Any]]:
    """
    Sanitizes diagnostics by masking raw values unless explicit synthetic debug flag is enabled.
    """
    diagnostics = []

    for doc in document_results:
        doc_id = doc.get("id", "unknown_doc")
        is_synthetic = doc.get("is_synthetic", True)

        # Safety check: never unmask non-synthetic documents
        can_unmask = allow_unmasked_synthetic and is_synthetic

        exp_list = doc.get("expected", [])
        det_list = doc.get("detected", [])

        # Log False Negatives
        for e in exp_list:
            if e.get("matched_by") is None:
                diagnostics.append({
                    "doc_id": doc_id,
                    "error_type": "FALSE_NEGATIVE",
                    "entity_id": e.get("id"),
                    "entity_type": e.get("type"),
                    "start": e.get("start"),
                    "end": e.get("end"),
                    "value": e.get("value") if can_unmask else "[REDACTED_BY_EVALUATOR]",
                    "residual_characters": e.get("residual_characters"),
                    "incomplete_span": e.get("incomplete_span", False)
                })
            elif e.get("incomplete_span", False):
                # Matched but incomplete span (privacy-critical flaw)
                diagnostics.append({
                    "doc_id": doc_id,
                    "error_type": "INCOMPLETE_REDACTION",
                    "entity_id": e.get("id"),
                    "entity_type": e.get("type"),
                    "start": e.get("start"),
                    "end": e.get("end"),
                    "value": e.get("value") if can_unmask else "[REDACTED_BY_EVALUATOR]",
                    "residual_characters": e.get("residual_characters"),
                    "incomplete_span": True
                })

        # Log False Positives
        for d in det_list:
            if d.get("matched_to") is None:
                diagnostics.append({
                    "doc_id": doc_id,
                    "error_type": "FALSE_POSITIVE",
                    "entity_id": d.get("id"),
                    "entity_type": d.get("type"),
                    "start": d.get("start"),
                    "end": d.get("end"),
                    "value": d.get("value") if can_unmask else "[REDACTED_BY_EVALUATOR]",
                    "is_duplicate": (d.get("duplicate_of") is not None)
                })

    return diagnostics


def generate_json_report(
    summary_metrics: Dict[str, Any],
    document_results: List[Dict[str, Any]],
    run_metadata: Dict[str, Any],
    allow_unmasked_synthetic: bool = False
) -> Dict[str, Any]:
    """Constructs the full JSON audit payload."""
    diagnostics = sanitize_diagnostic_entries(document_results, allow_unmasked_synthetic)

    return {
        "run_metadata": run_metadata,
        "metrics": summary_metrics,
        "diagnostics_count": len(diagnostics),
        "diagnostics": diagnostics
    }


def generate_markdown_report(
    json_report: Dict[str, Any]
) -> str:
    """Generates human-readable Markdown summary table without raw PII."""
    meta = json_report.get("run_metadata", {})
    metrics = json_report.get("metrics", {})
    micro = metrics.get("micro", {})
    macro = metrics.get("macro", {})
    leak = metrics.get("privacy_leakage", {})
    clean = metrics.get("clean_documents", {})
    per_class = metrics.get("per_class", {})

    lines = [
        "# Ciphera Held-Out Benchmark Evaluation Report",
        "",
        f"**Run Timestamp:** {meta.get('timestamp', 'N/A')}  ",
        f"**Git Commit SHA:** `{meta.get('git_commit', 'N/A')}` ({meta.get('git_status', 'clean')})  ",
        f"**Python Version:** {meta.get('python_version', 'N/A')}  ",
        f"**Pipeline Variant:** {meta.get('pipeline_variant', 'Production V3.6')}  ",
        "",
        "---",
        "## 1. Overall System Performance Summary",
        "",
        "| Evaluation Level | Metric | Value | Reference / Target |",
        "| :--- | :--- | :--- | :--- |",
        f"| **Entity Micro** | Precision | {micro.get('precision', 0.0):.4f} | Target > 0.85 |",
        f"| **Entity Micro** | Recall | {micro.get('recall', 0.0):.4f} | Target > 0.90 |",
        f"| **Entity Micro** | F1 Score | {micro.get('f1', 0.0):.4f} | Target > 0.85 |",
        f"| **Entity Micro** | Exact-Span Ratio | {micro.get('exact_span_ratio', 0.0):.4f} | Proportion matching exact bounds |",
        f"| **Entity Micro** | Incomplete Span Ratio | {micro.get('incomplete_span_ratio', 0.0):.4f} | Proportion leaving residual chars |",
        f"| **Entity Macro** | Macro Precision | {macro.get('precision', 0.0):.4f} | Unweighted class average |",
        f"| **Entity Macro** | Macro Recall | {macro.get('recall', 0.0):.4f} | Unweighted class average |",
        f"| **Entity Macro** | Macro F1 | {macro.get('f1', 0.0):.4f} | Unweighted class average |",
        f"| **Privacy Outcome** | Detection Document Leak Rate | {leak.get('detection_document_leak_rate', 0.0):.4f} | Target = 0.0000 |",
        f"| **Privacy Outcome** | Artifact Residual Leak Rate | {leak.get('artifact_residual_doc_leak_rate', 0.0):.4f} | Target = 0.0000 |",
        "",
        "---",
        "## 2. Clean Document (Hard Negatives) Performance",
        "",
    ]

    if clean:
        lines.extend([
            f"- **Total Clean Documents Evaluated:** {clean.get('total_clean_docs', 0)}",
            f"- **Clean Docs with False Alarms:** {clean.get('clean_docs_with_false_positives', 0)}",
            f"- **Total False Positives in Clean Docs:** {clean.get('total_false_positives_in_clean_docs', 0)}",
            f"- **Clean Document False-Alarm Rate:** {clean.get('clean_doc_false_alarm_rate', 0.0):.4f}",
            "",
        ])
    else:
        lines.append("*No clean hard-negative documents in this evaluation run.*\n")

    lines.extend([
        "---",
        "## 3. Per-Class Entity Breakdown",
        "",
        "| Entity Class | TP | FP | FN | Exact TP | Incomplete TP | Precision | Recall | F1 Score | Exact Ratio |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
    ])

    for cls, cm in per_class.items():
        p_str = f"{cm['precision']:.4f}" if cm.get('precision') is not None else "N/A"
        r_str = f"{cm['recall']:.4f}" if cm.get('recall') is not None else "N/A"
        f1_str = f"{cm['f1']:.4f}" if cm.get('f1') is not None else "N/A"
        ex_str = f"{cm['exact_span_ratio']:.4f}" if cm.get('exact_span_ratio') is not None else "N/A"

        lines.append(
            f"| `{cls}` | {cm['tp']} | {cm['fp']} | {cm['fn']} | {cm['tp_exact']} | "
            f"{cm['incomplete_tp']} | {p_str} | {r_str} | {f1_str} | {ex_str} |"
        )

    lines.extend([
        "",
        "---",
        "## 4. Privacy Notice & Sanitization Guarantee",
        "> [!NOTE]",
        "> All raw entity values and surrounding text strings in this report are scrubbed and replaced with `[REDACTED_BY_EVALUATOR]`. Diagnostic logs refer strictly to entity types, offsets, and failure taxonomy codes to prevent evaluation artifacts from leaking sensitive identifiers.",
        ""
    ])

    return "\n".join(lines)
