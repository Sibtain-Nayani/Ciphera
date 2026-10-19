# Ciphera Held-Out Benchmark: Freeze Record & Dependency Manifest (Stage 5)

> **Freeze Timestamp:** 2026-10-12T18:42:00+05:30  
> **Status:** SEALED PRIOR TO CORPUS GENERATION  
> **Evaluator Git Commit:** `f77567d3d7b5106895305f64a1aee6aeed635692`  
> **Branch:** `backend-hardening`  
> **Working Tree State:** Clean with respect to core engine rules; Stage 4B verifiers sealed.

---

## 1. Environment & Dependency Manifest

The execution and evaluation environment is standardized in Docker container `ciphera_backend`:
- **OS / Platform:** Linux (Docker container `ciphera_backend`) / Windows host PowerShell
- **Python Version:** `3.11.16`
- **PyMuPDF (`fitz`):** `1.24.9` (MuPDF engine `1.24.8`)
- **Pydantic:** `2.8.2`
- **FastAPI:** `0.115.0`
- **Pytest:** `8.1.1`
- **Pillow (PIL):** `10.4.0`
- **Tesseract OCR (Docker internal):** Accessible via `OCRProcessor`

---

## 2. Frozen Evaluation & Verification Code Checksums

Every component of the evaluation harness and the Stage 4B verifier implementation has been hashed with SHA-256 before generating any corpus documents:

| Component / File Path | SHA-256 Checksum | Purpose / Description |
| :--- | :--- | :--- |
| `backend/app/services/verification_geometry.py` | `8fef2e4d45e9d88a437950df5f3f6b7d359b8dc84479caf774af8c58720b60d2` | Stage 4B Bbox envelope & boundary continuation checks |
| `backend/app/services/verification_engine.py` | `05d16a7e3ff5692bfc97a302fff5c7f5e6e0ebf226166dba46d5d3591bfa5037` | Stage 4B Layer 3.6 entity residual fragment scan |
| `research/held_out_benchmark/evaluation/checksum_validator.py` | `2bfc92fdf648fefe3d4297252a6f4acfa0ccff05b649784c26082e09890e9344` | Evaluator SHA-256 verification utility |
| `research/held_out_benchmark/evaluation/eval_held_out.py` | `6f0cd79160a11da538e5d9e502c995a55e16a1fe04d3c2af0063403a5b083f18` | Master benchmark runner |
| `research/held_out_benchmark/evaluation/matching_bipartite.py` | `8a979a544ad1c6ebc39c9e4a1934bf735e55b384596f194ccd93d1d25309dda2` | Kuhn-Munkres maximum-weight bipartite assignment |
| `research/held_out_benchmark/evaluation/metrics_calculator.py` | `acc0541491cbbbe75546d006fd14f2797e7411d9a27f872732fc63ca367c1b84` | Exact vs overlap, FPR/FRR, dual-channel metrics |
| `research/held_out_benchmark/evaluation/report_generator.py` | `238fefdc114fe78f2e67ec58a0c94dc06ea7f503979c82f853d0949b50a4ef65` | Privacy-safe Markdown and JSON reporting |
| `research/held_out_benchmark/evaluation/test_evaluator.py` | `6993c842ddeed5b71e85a5b1fc4dfc985adefa90c44226f18dcce74d53670ad3` | 11 unit tests for evaluator components |
| `research/held_out_benchmark/evaluation/test_verifier_fault_injection.py` | `90f50a115d104234768e11e247ee6e38956000740afb9c0418bcf13cd302b921` | 14 Stage 4/4B fault-injection fixtures (100% pass) |

---

## 3. Historical Development Baseline Frozen Checksums

The existing development and tuning sets remain strictly untouched:

| Historical Dataset Path | SHA-256 Checksum | Entities | Role |
| :--- | :--- | :---: | :--- |
| `backend/benchmark_dataset/sets/regression_set.json` | `4968dd30273f7584486df59d58e27ca60e4644346063c429b18e6fb5c26fde97` | 32 | Core baseline development tests |
| `backend/benchmark_dataset/sets/adversarial_set.json` | `aa5947a412fb76a72077689023a564770c964c5c6746afe3b371f4a754e7a920` | 21 | Adversarial OCR & spacing cases |
| `backend/benchmark_dataset/sets/hard_negatives.json` | `378849e1707ff935331382f00238d81a2552797e9022da7afba756680b397c40` | 0 | Non-PII numerical negative controls |
| `backend/benchmark_dataset/sets/realistic_synthetic.json` | `788bc56b1de47da4992d3f75863d48040ede369d45caf9baf7335feac8a17740` | 37 | Dense synthetic clinical & HR documents |
| `research/benchmark/sets/tabular_scanned.json` | *Historical Phase R2* | 18 | Scanned multi-column table fixtures |

---

## 4. Evaluation Freeze Pledge

1. **Detector & Verifier Lock:** No regex, threshold, rule, logic, or verifier code will be altered based on or during the creation of this corpus.
2. **Benchmark Execution Lock:** Neither `eval_held_out.py` nor any detection pipeline function will be run against this corpus until the user formally reviews and authorizes Stage 6.
3. **Corpus Separation:** Held-out documents will be stored under `research/held_out_benchmark/corpus/` and never merged into `backend/benchmark_dataset/`.
