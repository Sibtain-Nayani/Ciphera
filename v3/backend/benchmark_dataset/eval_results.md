# Adversarial Benchmark Report

## Global Metrics
- **Precision:** 0.6364
- **Recall:**    0.5385
- **F1 Score:**  0.5833

## Per-Class Metrics
| Entity Type | Precision | Recall | F1 Score | TP | FP | FN |
|-------------|-----------|--------|----------|----|----|----|
| AADHAAR_NUMBER | 0.67 | 0.50 | 0.57 | 2 | 1 | 2 |
| BANK_ACCOUNT | 0.00 | 0.00 | 0.00 | 0 | 0 | 1 |
| DATE_OF_BIRTH | 1.00 | 0.67 | 0.80 | 2 | 0 | 1 |
| DATE_TIME | 0.00 | 0.00 | 0.00 | 0 | 2 | 0 |
| EMAIL_ADDRESS | 1.00 | 0.75 | 0.86 | 3 | 0 | 1 |
| PAN_NUMBER | 1.00 | 0.20 | 0.33 | 1 | 0 | 4 |
| PERSON | 0.50 | 0.75 | 0.60 | 3 | 3 | 1 |
| PHONE_NUMBER | 0.75 | 0.60 | 0.67 | 3 | 1 | 2 |
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
- **True Positives:** 0
- **False Positives:** 0
- **False Negatives:** 3

**🚨 FALSE NEGATIVES (LEAKS):**
- `AADHAAR_NUMBER`: "4532 88I2 990I"
- `PAN_NUMBER`: "ABCD E1234F"
- `PHONE_NUMBER`: "+91-987654321O"

---
### doc_003
- **True Positives:** 1
- **False Positives:** 2
- **False Negatives:** 0

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `PHONE_NUMBER`: "1234567890"
- `AADHAAR_NUMBER`: "453288129901"

---
### doc_004
- **True Positives:** 0
- **False Positives:** 0
- **False Negatives:** 2

**🚨 FALSE NEGATIVES (LEAKS):**
- `PAN_NUMBER`: "B V C P Q 9 9 9 9 Z"
- `AADHAAR_NUMBER`: "1 1 2 2   3 3 4 4   5 5 6 6"

---
### doc_005
- **True Positives:** 4
- **False Positives:** 1
- **False Negatives:** 1

**🚨 FALSE NEGATIVES (LEAKS):**
- `PAN_NUMBER`: "ABCDE1234F"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `PERSON`: "ABCDE1234F"

---
### doc_006
- **True Positives:** 1
- **False Positives:** 2
- **False Negatives:** 3

**🚨 FALSE NEGATIVES (LEAKS):**
- `DATE_OF_BIRTH`: "24-11-2023"
- `BANK_ACCOUNT`: "987654321012"
- `PAN_NUMBER`: "CGFDE9876T"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `DATE_TIME`: "24-11-2023"
- `PERSON`: "CGFDE9876T है।"

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
