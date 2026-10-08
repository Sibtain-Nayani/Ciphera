# Ciphera Research Evaluation Methodology

## 1. Experimental Design & Objectives
The objective of Phase R1 is to conduct an empirical ablation and evaluation study of the Ciphera PII redaction and verification pipeline. We systematically decouple each specialized subsystem to quantify its isolated contribution to Precision, Recall, F1 score, and adversarial failure mitigation.

## 2. Evaluation Suites
Evaluation is conducted across four stratified benchmark suites comprising 31 canonical test documents and 72 ground-truth PII entities:

1. **Regression Suite (`regression_set.json` - 11 documents, 32 PII entities):**
   - Frozen historical benchmark testing core Indian PII entities (Aadhaar, PAN, Phone, Email, DOB, Bank Account, IFSC) across English and Hindi texts.
2. **Adversarial Suite (`adversarial_set.json` - 5 documents, 15 PII entities):**
   - High-noise documents testing OCR character confusions (`l`->`1`, `O`->`0`), spaced Aadhaar formatting, spatial line-wrapping, and mixed Hindi-English token sequences.
3. **Hard-Negative Suite (`hard_negatives.json` - 10 documents, 0 PII entities):**
   - Decoy documents testing non-PII numeric patterns, tracking numbers, invoice SKUs, server timestamps, order IDs, and non-sensitive currency codes to stress-test false-positive suppression.
4. **Realistic Synthetic Suite (`realistic_synthetic.json` - 5 documents, 25 PII entities):**
   - Complex domain documents (bank statements, hospital discharge summaries, employment contracts, insurance claims, tax records) with tabular layouts and dense multi-entity paragraphs.

## 3. Evaluated Subsystems (Ablations)

### R1.1 Context Gating Ablation
- **Hypothesis:** Gating candidate acceptance using contextual keyword windows suppresses false alarms on numeric/alphanumeric decoy strings without compromising recall.
- **Control (OFF):** Unconstrained regex matching without keyword lookbehind or distance gating.
- **Treatment (ON):** Production Context Gating requiring semantic anchors (e.g. "PAN", "Income Tax", "Aadhaar", "UID", "A/C", "Mobile", "Contact").

### R1.2 Candidate Resolution Precedence Ablation
- **Hypothesis:** Prioritizing structured domain detectors with mathematical checksums (Verhoeff for Aadhaar, structure for PAN) over generic NLP (SpaCy/Presidio) prevents entity misclassification.
- **Control (Naive NLP):** Generic NLP entities take precedence over structured candidates upon span collision.
- **Treatment (Ciphera V3.6):** Structured candidates take precedence; NLP serves as supporting context and boundary arbitration.

### R1.3 Spatial / Columnar Inference Ablation
- **Hypothesis:** Geometric columnar extrapolation recovers tabular PII entries where individual cell text lacks explicit inline keyword labels.
- **Control (OFF):** Single-stream text extraction without bounding-box column extrapolation.
- **Treatment (ON):** `ColumnarInferenceEngine` projecting header context across vertical column coordinates.

### R1.4 Position-Aware OCR Normalization Ablation
- **Hypothesis:** Candidate-constrained OCR character substitution (`l`/`I`->`1`, `O`->`0`) recovers corrupted PII without generating false positives across arbitrary text.
- **Variants:**
  - Variant A: Raw OCR (No character substitution).
  - Variant B: Position-Aware Candidate Normalization (Ciphera E1).
  - Variant C: Global Unconstrained Text Replacement (Document-wide replacement).

### R1.5 Independent Checker Experiment
- **Hypothesis:** A zero-trust multi-layered Checker (Geometry + Visual OCR + Independent Defragmentation Regex) catches Maker redaction failures with high detection rate and zero false alarm rate.
- **Experiment:** Deliberately inject 5 classes of Maker defects across a synthetic test corpus:
  1. Missed entity (0 bbox generated)
  2. Bounding box under-coverage / descender clipping
  3. Spatial character fragmentation leak
  4. Searchable hidden OCR layer left intact
  5. Clean valid redaction (Control group)
