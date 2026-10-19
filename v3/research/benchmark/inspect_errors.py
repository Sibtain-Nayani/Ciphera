import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('research/reports/stage8_development_evaluation_report.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("=== FALSE NEGATIVES BREAKDOWN ===")
for d in data['document_breakdown']:
    if d['matched_count'] < d['expected_count']:
        missed = d['expected_count'] - d['matched_count']
        print(f"{d['doc_id']} ({d['category']}): missed {missed}/{d['expected_count']}")
        print(f"  Missed: {d.get('missed_entities')}")
        print(f"  Error: {d['error']}")

print("\n=== VERIFIER REJECTIONS ON CLEAN DOCS (Hard Negatives) ===")
for d in data['document_breakdown']:
    if d['expected_count'] == 0 and d['verifier_rejected']:
        print(f"{d['doc_id']} ({d['category']}): rejected with error: {d['error']}")

print("\n=== VERIFIER REJECTIONS ON PII DOCS ===")
for d in data['document_breakdown']:
    if d['expected_count'] > 0 and d['verifier_rejected']:
        print(f"{d['doc_id']} ({d['category']}): rejected with error: {d['error']}")

print("\n=== HARD NEGATIVE FALSE ALARMS ===")
for d in data['document_breakdown']:
    if d['expected_count'] == 0 and d['detected_count'] > 0:
        print(f"{d['doc_id']} ({d['category']}): detected {d['detected_count']} spurious entities")
