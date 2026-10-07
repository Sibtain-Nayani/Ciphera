import json

with open('backend/benchmark_dataset/dataset.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

new_docs = [
  {
    "id": "doc_009_defrag_stress",
    "type": "defrag_trap",
    "content": "A list of unrelated numbers: 9 8 7 6 5 4 3 2 1 0. And a table: Price 4 5 3 2 Qty 8 8 1 2 Total 9 9 0 1. Also: P.A.N. is A B C D E 1 2 3 4 F.",
    "expected_entities": [
      {"type": "PAN_NUMBER", "value": "A B C D E 1 2 3 4 F"}
    ]
  },
  {
    "id": "doc_010_ocr_stress",
    "type": "ocr_trap",
    "content": "The Aadhaar is 1l22 3344 55O6. PAN: I3CDEI234O. Legitimate serial OOOO1111OOOO.",
    "expected_entities": [
      {"type": "AADHAAR_NUMBER", "value": "1l22 3344 55O6"},
      {"type": "PAN_NUMBER", "value": "I3CDEI234O"}
    ]
  },
  {
    "id": "doc_011_context_stress",
    "type": "context_trap",
    "content": "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. संपर्क: 9876543214.",
    "expected_entities": [
      {"type": "PHONE_NUMBER", "value": "9876543210"},
      {"type": "PHONE_NUMBER", "value": "9876543214"}
    ]
  }
]

# Only extend if not already added
if not any(d['id'] == 'doc_009_defrag_stress' for d in data):
    data.extend(new_docs)
    with open('backend/benchmark_dataset/dataset.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Stress tests added.")
else:
    print("Stress tests already exist.")
