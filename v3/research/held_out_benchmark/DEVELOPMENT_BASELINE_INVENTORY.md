# Ciphera Development Baseline Inventory & Freeze Record

> **Status:** FROZEN & SEALED  
> **Recorded Date:** 2026-10-11  
> **Scope:** Historical Development & Tuning Sets (Not to be confused with Held-Out Evaluation Data)

---

## 1. Inventory Summary & Discrepancy Reconciliation

A complete disk-level audit of all benchmark files was conducted to reconcile historical documentation discrepancies. The exact repository reality is documented below:

| Directory Path | File Name | Document Count | Ground-Truth Entities | Target Failure Modes / Historical Role |
| :--- | :--- | :---: | :---: | :--- |
| `backend/benchmark_dataset/sets/` | `regression_set.json` | 11 | 32 | Baseline Indian PII (Aadhaar, PAN, Phone, Email, DOB, Bank, IFSC) |
| `backend/benchmark_dataset/sets/` | `adversarial_set.json` | 5 | 21 | OCR character confusion (`l`/`1`, `O`/`0`), spaced tokens, line wraps |
| `backend/benchmark_dataset/sets/` | `hard_negatives.json` | 10 | 0 | Non-PII numeric patterns, tracking numbers, SKUs, timestamps |
| `backend/benchmark_dataset/sets/` | `realistic_synthetic.json` | 5 | 37 | Dense multi-entity documents (hospital records, salary slips) |
| **Subtotal (Core Dev Corpus)** | **4 files** | **31** | **90** | **Base Development Baseline** |
| `backend/benchmark_dataset/` | `dataset.json` | 11 | 32 | *Byte-for-byte duplicate* of `regression_set.json` (kept for legacy scripts) |
| `research/benchmark/sets/` | `tabular_scanned.json` | 3 | 18 | Scanned multi-column table layout benchmark (Phase R2) |
| `research/benchmark/sets/` | `regression_set.json` | 11 | 32 | *Mirror copy* of backend regression set |
| `research/benchmark/sets/` | `adversarial_set.json` | 5 | 21 | *Mirror copy* of backend adversarial set |
| `research/benchmark/sets/` | `hard_negatives.json` | 10 | 0 | *Mirror copy* of backend hard negative set |
| `research/benchmark/sets/` | `realistic_synthetic.json` | 5 | 37 | *Mirror copy* of backend realistic synthetic set |
| **Grand Total (Unique Corpus)** | **5 unique sets** | **34 unique docs** | **108 entities** | **Full Frozen Development Baseline** |

### Historical Count Reconciliation:
- Historical reports cited *"31 documents, 72 entities"*. That count reflects an earlier milestone before `adversarial_set.json` was expanded from 15 to 21 entities (+6) and `realistic_synthetic.json` was expanded from 25 to 37 entities (+12). The updated base count is: $32 + 21 + 0 + 37 = 90$ entities across 31 documents.
- Including `tabular_scanned.json` (3 documents, 18 entities) yields the complete total of **34 unique documents and 108 ground-truth entities**.

---

## 2. Document Identifiers & Ground-Truth Entity Counts

### A. Regression Suite (`regression_set.json` — 11 docs, 32 entities)
- `doc_001`: 3 entities (Aadhaar, PAN, Phone)
- `doc_002`: 3 entities (PAN, Email, DOB)
- `doc_003`: 3 entities (Bank Account, IFSC, Phone)
- `doc_004`: 3 entities (Aadhaar, Phone, Email)
- `doc_005`: 3 entities (Aadhaar, PAN, DOB)
- `doc_006`: 3 entities (Aadhaar, Bank Account, IFSC)
- `doc_007`: 3 entities (PAN, Phone, Email)
- `doc_008`: 3 entities (Aadhaar, PAN, Bank Account)
- `doc_009_defrag_stress`: 3 entities (Aadhaar, PAN, Phone)
- `doc_010_ocr_stress`: 3 entities (Aadhaar, PAN, IFSC)
- `doc_011_context_stress`: 2 entities (PAN, Phone)

### B. Adversarial Suite (`adversarial_set.json` — 5 docs, 21 entities)
- `adv_001_heavy_ocr_pan_aadhaar`: 4 entities
- `adv_002_extreme_whitespace_pan`: 3 entities
- `adv_003_multiline_split_phone_email`: 4 entities
- `adv_004_bilingual_hindi_account_aadhaar`: 5 entities
- `adv_005_misdirection_with_real_pii`: 5 entities

### C. Hard-Negative Suite (`hard_negatives.json` — 10 docs, 0 entities)
- `hn_001_courier_tracking` to `hn_010_hindi_non_pii_references`: 0 entities each.

### D. Realistic Synthetic Suite (`realistic_synthetic.json` — 5 docs, 37 entities)
- `real_001_hospital_discharge_summary`: 8 entities
- `real_002_employee_onboarding_kyc`: 9 entities
- `real_003_gst_commercial_invoice`: 6 entities
- `real_004_insurance_motor_claim`: 7 entities
- `real_005_hindi_bank_kyc_form`: 7 entities

### E. Tabular Scanned Suite (`tabular_scanned.json` — 3 docs, 18 entities)
- `scanned_inv_001`: 4 entities
- `scanned_stmt_002`: 5 entities
- `scanned_payroll_003`: 9 entities

---

## 3. Freeze & Air-Gap Covenant
1. **Zero Modifications:** None of the 34 development documents or their annotations will be altered, tuned against, or augmented during held-out evaluation work.
2. **Strict Classification:** All 34 documents are formally classified as **Development / Training Baseline**. They provide historical regression checks but cannot be cited as unseen validation of generalization.
