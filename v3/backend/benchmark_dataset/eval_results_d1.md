# Adversarial Benchmark Report

## Global Metrics
- **Precision:** 0.8387
- **Recall:**    0.8387
- **F1 Score:**  0.8387

## Per-Class Metrics
| Entity Type | Precision | Recall | F1 Score | TP | FP | FN |
|-------------|-----------|--------|----------|----|----|----|
| AADHAAR_NUMBER | 1.00 | 0.80 | 0.89 | 4 | 0 | 1 |
| BANK_ACCOUNT | 1.00 | 1.00 | 1.00 | 1 | 0 | 0 |
| DATE_OF_BIRTH | 1.00 | 0.67 | 0.80 | 2 | 0 | 1 |
| DATE_TIME | 0.00 | 0.00 | 0.00 | 0 | 3 | 0 |
| EMAIL_ADDRESS | 1.00 | 0.75 | 0.86 | 3 | 0 | 1 |
| PAN_NUMBER | 1.00 | 1.00 | 1.00 | 7 | 0 | 0 |
| PERSON | 0.75 | 0.75 | 0.75 | 3 | 1 | 1 |
| PHONE_NUMBER | 1.00 | 0.86 | 0.92 | 6 | 0 | 1 |
| PIN_CODE | 0.00 | 0.00 | 0.00 | 0 | 1 | 0 |

## Document Breakdown
### doc_001
- **True Positives:** 6
- **False Positives:** 2
- **False Negatives:** 0

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `PERSON`: "Lotus Enclave"
- `PIN_CODE`: "411001"

---
### doc_002
- **True Positives:** 3
- **False Positives:** 0
- **False Negatives:** 0

---
### doc_003
- **True Positives:** 1
- **False Positives:** 0
- **False Negatives:** 0

---
### doc_004
- **True Positives:** 2
- **False Positives:** 0
- **False Negatives:** 0

---
### doc_005
- **True Positives:** 5
- **False Positives:** 0
- **False Negatives:** 0

---
### doc_006
- **True Positives:** 3
- **False Positives:** 1
- **False Negatives:** 1

**🚨 FALSE NEGATIVES (LEAKS):**
- `DATE_OF_BIRTH`: "24-11-2023"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `DATE_TIME`: "24-11-2023"

---
### doc_007
- **True Positives:** 0
- **False Positives:** 1
- **False Negatives:** 3

**🚨 FALSE NEGATIVES (LEAKS):**
- `PERSON`: "Anjali
Deshmukh"
- `EMAIL_ADDRESS`: "anjali.deshmukh
@enterprise.com"
- `PHONE_NUMBER`: "912
3456789"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `DATE_TIME`: "3456789"

---
### doc_008
- **True Positives:** 2
- **False Positives:** 0
- **False Negatives:** 0

---
### doc_009_defrag_stress
- **True Positives:** 1
- **False Positives:** 0
- **False Negatives:** 0

---
### doc_010_ocr_stress
- **True Positives:** 1
- **False Positives:** 1
- **False Negatives:** 1

**🚨 FALSE NEGATIVES (LEAKS):**
- `AADHAAR_NUMBER`: "1l22 3344 55O6"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `DATE_TIME`: "55O6"

---
### doc_011_context_stress
- **True Positives:** 2
- **False Positives:** 0
- **False Negatives:** 0

---
