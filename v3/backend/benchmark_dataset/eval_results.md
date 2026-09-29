# Adversarial Benchmark Report

## Global Metrics
- **Precision:** 0.5667
- **Recall:**    0.5484
- **F1 Score:**  0.5574

## Per-Class Metrics
| Entity Type | Precision | Recall | F1 Score | TP | FP | FN |
|-------------|-----------|--------|----------|----|----|----|
| AADHAAR_NUMBER | 1.00 | 0.60 | 0.75 | 3 | 0 | 2 |
| BANK_ACCOUNT | 0.00 | 0.00 | 0.00 | 0 | 0 | 1 |
| DATE_OF_BIRTH | 1.00 | 0.67 | 0.80 | 2 | 0 | 1 |
| DATE_TIME | 0.00 | 0.00 | 0.00 | 0 | 2 | 0 |
| EMAIL_ADDRESS | 0.33 | 0.25 | 0.29 | 1 | 2 | 3 |
| PAN_NUMBER | 1.00 | 0.43 | 0.60 | 3 | 0 | 4 |
| PERSON | 0.50 | 0.75 | 0.60 | 3 | 3 | 1 |
| PHONE_NUMBER | 0.50 | 0.71 | 0.59 | 5 | 5 | 2 |
| PIN_CODE | 0.00 | 0.00 | 0.00 | 0 | 1 | 0 |

## Document Breakdown
### doc_001
- **True Positives:** 4
- **False Positives:** 3
- **False Negatives:** 2

**🚨 FALSE NEGATIVES (LEAKS):**
- `PHONE_NUMBER`: "9876543210"
- `EMAIL_ADDRESS`: "test.user@example.com"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `EMAIL_ADDRESS`: "9876543210 or test.user@example.com
Address"
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
- **False Positives:** 1
- **False Negatives:** 0

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `PHONE_NUMBER`: "1234567890"

---
### doc_004
- **True Positives:** 1
- **False Positives:** 0
- **False Negatives:** 1

**🚨 FALSE NEGATIVES (LEAKS):**
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
- `EMAIL_ADDRESS`: "Please contact our support engineer Anjali
Deshmukh at anjali.deshmukh
@enterprise.com or call"

---
### doc_008
- **True Positives:** 1
- **False Positives:** 0
- **False Negatives:** 1

**🚨 FALSE NEGATIVES (LEAKS):**
- `EMAIL_ADDRESS`: "admin@localhost.localdomain"

---
### doc_009_defrag_stress
- **True Positives:** 0
- **False Positives:** 1
- **False Negatives:** 1

**🚨 FALSE NEGATIVES (LEAKS):**
- `PAN_NUMBER`: "A B C D E 1 2 3 4 F"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `PHONE_NUMBER`: "9 8 7 6 5 4 3 2 1 0"

---
### doc_010_ocr_stress
- **True Positives:** 0
- **False Positives:** 1
- **False Negatives:** 2

**🚨 FALSE NEGATIVES (LEAKS):**
- `AADHAAR_NUMBER`: "1l22 3344 55O6"
- `PAN_NUMBER`: "I3CDEI234O"

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `DATE_TIME`: "55O6"

---
### doc_011_context_stress
- **True Positives:** 2
- **False Positives:** 3
- **False Negatives:** 0

**⚠️ FALSE POSITIVES (OVER-REDACTION):**
- `PHONE_NUMBER`: "9876543211"
- `PHONE_NUMBER`: "9876543212"
- `PHONE_NUMBER`: "9876543213"

---
