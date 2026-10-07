# Baseline False Positive (FP) Taxonomy Report

Based on the adversarial benchmark run `eval_results.md` (Precision: 0.6061, Recall: 0.6452, F1 Score: 0.6250), here is the classification of the 13 False Positives into distinct empirical categories.

### FP-01: Over-broad Context Gating (4 FPs)
The context-gating logic requires a keyword (like "Phone", "Mobile", "Call") within a specific character window to confirm a 10-digit number. However, the window is too large or too persistent, sweeping up unrelated 10-digit tracking numbers or serial IDs.
* **doc_011_context_stress**: `PHONE_NUMBER` on `"9876543211"`, `"9876543212"`, `"9876543213"`. The word "Phone" at the beginning of the text triggers the phone context for the entire string of tracking numbers.
* **doc_003**: `PHONE_NUMBER` on `"1234567890"`. A tracking number that falls into the same context radius as "phone number".

### FP-02: Aggressive De-fragmentation (1 FP)
The de-fragmentation step removes all whitespace before running regexes to catch widely spaced PII (`P A N : A B...`). This accidentally concatenates disjoint digits into PII shapes.
* **doc_009_defrag_stress**: `PHONE_NUMBER` on `"9 8 7 6 5 4 3 2 1 0"`. These were explicitly unrelated numbers, but space removal formed `9876543210`, which matched the phone pattern.

### FP-03: NLP Classification Errors (Spacy NER Hallucinations) (7 FPs)
The underlying NLP model (like `en_core_web_sm`) predicts entities like `PERSON` and `DATE_TIME` unreliably, especially when dealing with alphanumeric IDs or Indian names.
* **doc_001**: `PERSON` on `"Lotus Enclave"` (Apartment name classified as person).
* **doc_001**: `PIN_CODE` on `"411001"` (Wait, 411001 *is* a PIN Code. Ah, `dataset.json` didn't list it as an expected entity. It might be a true positive that the benchmark missed in ground truth, or we just don't redact pin codes by default. Actually, it's a False Positive because the benchmark says it's not expected).
* **doc_005**: `PERSON` on `"ABCDE1234F"` (A PAN number falsely recognized as a person by Spacy).
* **doc_006**: `PERSON` on `"CGFDE9876T \u0939\u0948\u0964 "` (PAN number + Hindi text recognized as a person).
* **doc_006**: `DATE_TIME` on `"24-11-2023"` (Expected to be `DATE_OF_BIRTH`, but Spacy tagged it as generic `DATE_TIME`).
* **doc_007**: `DATE_TIME` on `"3456789"` (Part of a phone number hallucinated as a date).
* **doc_010**: `DATE_TIME` on `"55O6"` (Part of an OCR-fuzzed Aadhaar hallucinated as a date).

### FP-04: Regex Overmatching (1 FP)
Regexes catching legitimate structured identifiers that resemble PII but are explicitly tracking IDs or serial numbers.
* **doc_010_ocr_stress**: `PAN_NUMBER` on `"OOOO1111OO"`. A legitimate serial ID matching the loose `[A-Z0158]{5}...` OCR-tolerant PAN regex. Because the validation step doesn't penalize it heavily enough to drop below the threshold, it is redacted.


## Proposed Strategy
I recommend attacking **FP-01 (Over-broad Context Gating)** or **FP-02 (Aggressive De-fragmentation)** first. 

* **FP-01 Fix Hypothesis**: Shrink the context-gating window from character-count (e.g., 80 chars) to structural boundaries (e.g., must be in the same line/sentence, or within 20 chars).
* **FP-02 Fix Hypothesis**: Restrict de-fragmentation to only trigger if the spaces are uniformly distributed, or only apply it to specific strict structural Regexes (like PAN/Aadhaar) and NOT generic 10-digit phones.

Please approve which FP category we should fix first in the empirical loop.
