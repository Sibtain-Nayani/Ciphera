# Ciphera Multi-Suite Benchmark Expansion Report

## Global Combined Metrics Across All 4 Benchmark Suites
- **Total Test Documents:** 31
- **Precision:** 0.7568
- **Recall:**    0.9333
- **F1 Score:**  0.8358
- **Total TP:**  84
- **Total FP:**  27
- **Total FN:**  6

## Per-Suite Breakdown
| Benchmark Suite | Docs | Precision | Recall | F1 Score | TP | FP | FN |
|---|---|---|---|---|---|---|---|
| **Regression Set (Frozen Historical)** | 11 | 1.0000 | 1.0000 | 1.0000 | 32 | 0 | 0 |
| **Adversarial Set (Stress & Formatting)** | 5 | 0.8571 | 0.8571 | 0.8571 | 18 | 3 | 3 |
| **Hard-Negative Set (Decoys & Non-PII)** | 10 | 0.0000 | 1.0000 | 0.0000 | 0 | 13 | 0 |
| **Realistic Synthetic Set (Domain Docs)** | 5 | 0.7556 | 0.9189 | 0.8293 | 34 | 11 | 3 |


## Per-Class Metrics (All Suites Combined)
| Entity Type | Precision | Recall | F1 Score | TP | FP | FN |
|---|---|---|---|---|---|---|
| AADHAAR_NUMBER | 0.77 | 1.00 | 0.87 | 10 | 3 | 0 |
| BANK_ACCOUNT | 0.71 | 0.83 | 0.77 | 5 | 2 | 1 |
| DATE_OF_BIRTH | 0.67 | 1.00 | 0.80 | 8 | 4 | 0 |
| DATE_TIME | 0.00 | 1.00 | 0.00 | 0 | 6 | 0 |
| DRIVING_LICENCE | 1.00 | 1.00 | 1.00 | 1 | 0 | 0 |
| EMAIL_ADDRESS | 1.00 | 0.90 | 0.95 | 9 | 0 | 1 |
| GST_NUMBER | 1.00 | 1.00 | 1.00 | 1 | 0 | 0 |
| IFSC_CODE | 1.00 | 0.80 | 0.89 | 4 | 0 | 1 |
| PAN_NUMBER | 0.88 | 1.00 | 0.93 | 14 | 2 | 0 |
| PERSON | 0.64 | 0.93 | 0.76 | 14 | 8 | 1 |
| PHONE_NUMBER | 0.93 | 0.93 | 0.93 | 14 | 1 | 1 |
| PIN_CODE | 0.80 | 0.80 | 0.80 | 4 | 1 | 1 |


## Document-by-Document Breakdown
### Regression Set (Frozen Historical)

#### `doc_001`
- **True Positives:** 7, **False Positives:** 0, **False Negatives:** 0

#### `doc_002`
- **True Positives:** 3, **False Positives:** 0, **False Negatives:** 0

#### `doc_003`
- **True Positives:** 1, **False Positives:** 0, **False Negatives:** 0

#### `doc_004`
- **True Positives:** 2, **False Positives:** 0, **False Negatives:** 0

#### `doc_005`
- **True Positives:** 5, **False Positives:** 0, **False Negatives:** 0

#### `doc_006`
- **True Positives:** 4, **False Positives:** 0, **False Negatives:** 0

#### `doc_007`
- **True Positives:** 3, **False Positives:** 0, **False Negatives:** 0

#### `doc_008`
- **True Positives:** 2, **False Positives:** 0, **False Negatives:** 0

#### `doc_009_defrag_stress`
- **True Positives:** 1, **False Positives:** 0, **False Negatives:** 0

#### `doc_010_ocr_stress`
- **True Positives:** 2, **False Positives:** 0, **False Negatives:** 0

#### `doc_011_context_stress`
- **True Positives:** 2, **False Positives:** 0, **False Negatives:** 0

### Adversarial Set (Stress & Formatting)

#### `adv_001_heavy_ocr_pan_aadhaar`
- **True Positives:** 4, **False Positives:** 0, **False Negatives:** 0

#### `adv_002_extreme_whitespace_pan`
- **True Positives:** 3, **False Positives:** 0, **False Negatives:** 1
  - **FALSE NEGATIVES (LEAKS):**
    - `EMAIL_ADDRESS`: "vikram . malhotra @ enterprise . in"

#### `adv_003_multiline_split_phone_email`
- **True Positives:** 2, **False Positives:** 1, **False Negatives:** 1
  - **FALSE NEGATIVES (LEAKS):**
    - `PERSON`: "Pooja
Verma"
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `PAN_NUMBER`: "DATE DOSSIE"

#### `adv_004_bilingual_hindi_account_aadhaar`
- **True Positives:** 5, **False Positives:** 0, **False Negatives:** 0

#### `adv_005_misdirection_with_real_pii`
- **True Positives:** 4, **False Positives:** 2, **False Negatives:** 1
  - **FALSE NEGATIVES (LEAKS):**
    - `IFSC_CODE`: "HDFC0000123"
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `DATE_OF_BIRTH`: "24.11.2023"
    - `PAN_NUMBER`: "C HDFC00001"

### Hard-Negative Set (Decoys & Non-PII)

#### `hn_001_courier_tracking`
- **True Positives:** 0, **False Positives:** 4, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `PERSON`: "BlueDart AWB"
    - `BANK_ACCOUNT`: "987654321012"
    - `PERSON`: "waybill ref"
    - `BANK_ACCOUNT`: "112233445566"

#### `hn_002_ecommerce_orders`
- **True Positives:** 0, **False Positives:** 0, **False Negatives:** 0

#### `hn_003_software_versions`
- **True Positives:** 0, **False Positives:** 1, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `DATE_OF_BIRTH`: "24.11.2023"

#### `hn_004_hardware_serials`
- **True Positives:** 0, **False Positives:** 2, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `AADHAAR_NUMBER`: "4532-8812-9901"
    - `AADHAAR_NUMBER`: "1l2233445506"

#### `hn_005_financial_transaction_refs`
- **True Positives:** 0, **False Positives:** 0, **False Negatives:** 0

#### `hn_006_system_errors_ports`
- **True Positives:** 0, **False Positives:** 2, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `PERSON`: "Syslog"
    - `PIN_CODE`: "411001"

#### `hn_007_otp_and_security_tokens`
- **True Positives:** 0, **False Positives:** 2, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `DATE_TIME`: "987654"
    - `DATE_TIME`: "15 minutes"

#### `hn_008_building_complexes_non_person`
- **True Positives:** 0, **False Positives:** 0, **False Negatives:** 0

#### `hn_009_degraded_serial_traps`
- **True Positives:** 0, **False Positives:** 0, **False Negatives:** 0

#### `hn_010_hindi_non_pii_references`
- **True Positives:** 0, **False Positives:** 2, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `DATE_OF_BIRTH`: "24.11.2023"
    - `PERSON`: "स्थापित हुआ। प्रवेश सत्यापन कोड"

### Realistic Synthetic Set (Domain Docs)

#### `real_001_hospital_discharge_summary`
- **True Positives:** 7, **False Positives:** 6, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `PERSON`: "Aadhaar UID"
    - `PERSON`: "Tab Atorvastatin 40mg"
    - `DATE_TIME`: "daily"
    - `PERSON`: "Tab Clopidogrel"
    - `DATE_TIME`: "daily"
    - `DATE_TIME`: "2 weeks"

#### `real_002_employee_onboarding_kyc`
- **True Positives:** 8, **False Positives:** 1, **False Negatives:** 1
  - **FALSE NEGATIVES (LEAKS):**
    - `BANK_ACCOUNT`: "987654321012"
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `AADHAAR_NUMBER`: "987654321012"

#### `real_003_gst_commercial_invoice`
- **True Positives:** 8, **False Positives:** 0, **False Negatives:** 0

#### `real_004_insurance_motor_claim`
- **True Positives:** 5, **False Positives:** 1, **False Negatives:** 0
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `DATE_OF_BIRTH`: "24-11-2023"

#### `real_005_hindi_bank_kyc_form`
- **True Positives:** 6, **False Positives:** 3, **False Negatives:** 2
  - **FALSE NEGATIVES (LEAKS):**
    - `PHONE_NUMBER`: "9876543210"
    - `PIN_CODE`: "211001"
  - **FALSE POSITIVES (OVER-REDACTIONS):**
    - `PERSON`: "का नाम"
    - `PHONE_NUMBER`: "9876543210"
    - `DATE_TIME`: "45, सिविल लाइन्स"
