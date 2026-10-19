import json

s9 = json.load(open('research/reports/held_out_stage9/STAGE_9_BENCHMARK_RESULTS.json', 'r', encoding='utf-8'))

print("=== SCANNED DEGRADED DOCUMENTS DIAGNOSTICS IN STAGE 9 ===")
for d in s9.get('diagnostics', []):
    if 'scanned' in d.get('doc_id', ''):
        print(f"{d.get('doc_id')} | {d.get('error_type')} | {d.get('entity_type')} | {d.get('entity_id')}")

# Also check manifest info for the 8 documents
manifest = json.load(open('research/held_out_benchmark/corpus/CORPUS_MANIFEST.json', 'r', encoding='utf-8'))
scanned_manifest = [m for m in manifest['documents'] if 'scanned' in m['id']]
print("\n=== SCANNED DEGRADED MANIFEST INFO ===")
for sm in scanned_manifest:
    print(sm['id'], sm['file_name'], sm['category'], sm['tier'])
