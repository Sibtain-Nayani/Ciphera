import json

with open('research/reports/held_out_stage6/STAGE_6_BENCHMARK_RESULTS.json', 'r', encoding='utf-8') as f:
    s6 = json.load(f)
with open('research/reports/held_out_stage9/STAGE_9_BENCHMARK_RESULTS.json', 'r', encoding='utf-8') as f:
    s9 = json.load(f)

print('=== METRIC COMPARISON: STAGE 6 vs STAGE 9 ===')
m6 = s6['overall']['micro']
m9 = s9['overall']['micro']

print(f'Micro Precision: {m6["precision"]*100:.2f}% -> {m9["precision"]*100:.2f}% (delta: {(m9["precision"]-m6["precision"])*100:+.2f}%)')
print(f'Micro Recall:    {m6["recall"]*100:.2f}% -> {m9["recall"]*100:.2f}% (delta: {(m9["recall"]-m6["recall"])*100:+.2f}%)')
print(f'Micro F1 Score:  {m6["f1"]*100:.2f}% -> {m9["f1"]*100:.2f}% (delta: {(m9["f1"]-m6["f1"])*100:+.2f}%)')
print(f'True Positives:  {m6["tp"]} -> {m9["tp"]} (delta: {m9["tp"]-m6["tp"]:+} TP)')
print(f'False Negatives: {m6["fn"]} -> {m9["fn"]} (delta: {m9["fn"]-m6["fn"]:+} FN)')
print(f'False Positives: {m6["fp"]} -> {m9["fp"]} (delta: {m9["fp"]-m6["fp"]:+} FP)')

print('\n=== PRIVACY & SAFETY ===')
p6 = s6['overall']['privacy_leakage']
p9 = s9['overall']['privacy_leakage']
print(f'Detection Doc Leaks: {p6.get("docs_with_detection_leak")} / {p6.get("eligible_pii_docs_count")} ({p6.get("detection_document_leak_rate")*100:.2f}%) -> {p9.get("docs_with_detection_leak")} / {p9.get("eligible_pii_docs_count")} ({p9.get("detection_document_leak_rate")*100:.2f}%)')
print(f'Artifact Residual Leaks: {p6.get("docs_with_artifact_residual_leak")} / {p6.get("eligible_pii_docs_count")} ({p6.get("artifact_residual_doc_leak_rate")*100:.2f}%) -> {p9.get("docs_with_artifact_residual_leak")} / {p9.get("eligible_pii_docs_count")} ({p9.get("artifact_residual_doc_leak_rate")*100:.2f}%)')
print(f'Verifier Rejection Rate (PII): N/A (Stage 6) -> {p9.get("pii_docs_verifier_rejection_rate")*100:.2f}% ({p9.get("pii_docs_rejected_by_verifier")} docs blocked)')

print('\n=== CLEAN DOCUMENTS (HARD NEGATIVES) ===')
c6 = s6['overall']['clean_documents']
c9 = s9['overall']['clean_documents']
print(f'Clean Docs FP count: {c6.get("total_false_positives_in_clean_docs")} -> {c9.get("total_false_positives_in_clean_docs")}')
print(f'Clean Doc False Alarm Rate: {c6.get("clean_doc_false_alarm_rate")*100:.2f}% -> {c9.get("clean_doc_false_alarm_rate")*100:.2f}%')
print(f'Clean Doc False Rejection Rate: {c6.get("clean_doc_false_rejection_rate")*100:.2f}% -> {c9.get("clean_doc_false_rejection_rate")*100:.2f}% ({c9.get("clean_docs_rejected_by_verifier")}/{c9.get("clean_docs_evaluated_for_rejection")})')

print('\n=== CORE CLASSES COMPARISON ===')
for cls in sorted(s9['overall']['per_class'].keys()):
    c9_data = s9['overall']['per_class'][cls]
    if not c9_data.get('is_core_annotated_class'):
        continue
    c6_data = s6['overall']['per_class'].get(cls, {})
    p6_v = (c6_data.get('precision') or 0.0) * 100
    r6_v = (c6_data.get('recall') or 0.0) * 100
    f6_v = (c6_data.get('f1') or 0.0) * 100
    p9_v = (c9_data.get('precision') or 0.0) * 100
    r9_v = (c9_data.get('recall') or 0.0) * 100
    f9_v = (c9_data.get('f1') or 0.0) * 100
    print(f'{cls:18} | Stage 6: P={p6_v:5.1f}% R={r6_v:5.1f}% F1={f6_v:5.1f}% | Stage 9: P={p9_v:5.1f}% R={r9_v:5.1f}% F1={f9_v:5.1f}% | TP={c9_data.get("tp")} FN={c9_data.get("fn")} FP={c9_data.get("fp")}')

print('\n=== CATEGORY COMPARISON ===')
for cat in sorted(s9.get('category_metrics', {}).keys()):
    m6 = s6.get('category_metrics', {}).get(cat, {}).get('micro', {})
    m9 = s9.get('category_metrics', {}).get(cat, {}).get('micro', {})
    p6 = (m6.get('precision') or 0.0) * 100
    r6 = (m6.get('recall') or 0.0) * 100
    f6 = (m6.get('f1') or 0.0) * 100
    p9 = (m9.get('precision') or 0.0) * 100
    r9 = (m9.get('recall') or 0.0) * 100
    f9 = (m9.get('f1') or 0.0) * 100
    tp6, fp6 = m6.get('tp', 0), m6.get('fp', 0)
    tp9, fp9 = m9.get('tp', 0), m9.get('fp', 0)
    print(f'{cat:22} | S6 F1={f6:5.1f}% (P={p6:5.1f}%, R={r6:5.1f}%, TP={tp6:2d}, FP={fp6:2d}) | S9 F1={f9:5.1f}% (P={p9:5.1f}%, R={r9:5.1f}%, TP={tp9:2d}, FP={fp9:2d})')
