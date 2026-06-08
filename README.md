<div align="center">

```
 ██████╗██╗██████╗ ██╗  ██╗███████╗██████╗  █████╗
██╔════╝██║██╔══██╗██║  ██║██╔════╝██╔══██╗██╔══██╗
██║     ██║██████╔╝███████║█████╗  ██████╔╝███████║
██║     ██║██╔═══╝ ██╔══██║██╔══╝  ██╔══██╗██╔══██║
╚██████╗██║██║     ██║  ██║███████╗██║  ██║██║  ██║
 ╚═════╝╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝
```

**Client-side PII redaction. Nothing leaves your machine.**

[![Version](https://img.shields.io/badge/version-3.0.0-F5C400?style=flat-square)](https://github.com/Sibtain-Nayani/Ciphera)
[![DPDP Act 2023](https://img.shields.io/badge/DPDP%20Act%202023-compliant-4ade80?style=flat-square)](#compliance)
[![GDPR](https://img.shields.io/badge/GDPR%20Art.%2025-compliant-4ade80?style=flat-square)](#compliance)
[![Local Inference](https://img.shields.io/badge/inference-local%20only-F5C400?style=flat-square)](#architecture)
[![Next.js](https://img.shields.io/badge/Next.js-15-white?style=flat-square)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-white?style=flat-square)](https://fastapi.tiangolo.com)

---

*Aadhaar. PAN. GSTIN. Biometrics. Found, flagged, and removed — before anything leaves your machine.*

[**Live Demo**](#) · [**Documentation**](#documentation) · [**API Reference**](#api-reference) · [**Report a Bug**](#contributing)

</div>

---

## What is Ciphera?

Ciphera is a **client-side document redaction engine** built for individuals, compliance teams, legal departments, and data engineers who need to share documents without exposing sensitive personal information.

It detects and removes **Personally Identifiable Information (PII)** — Aadhaar numbers, PAN cards, GSTIN codes, phone numbers, email addresses, biometric identifiers, bank account details, and more — using a four-stage ensemble detection pipeline. Everything runs locally. No data is ever transmitted to a server. No cloud processing. No retention.

**Zero bytes sent. Zero data stored.**

Built specifically for Indian regulatory compliance (DPDP Act 2023) with full GDPR and ISO 27001 alignment.

---

## Table of Contents

- [Why Ciphera](#why-ciphera)
- [Features](#features)
- [Detection Pipeline](#detection-pipeline)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Docker Deployment](#docker-deployment)
- [Usage](#usage)
  - [Single Document Redaction](#single-document-redaction)
  - [Batch Processing](#batch-processing)
  - [Visual Canvas Redaction](#visual-canvas-redaction)
  - [Synthetic Substitution](#synthetic-substitution)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Supported PII Types](#supported-pii-types)
- [Compliance](#compliance)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)

---

## Why Ciphera

Every day, sensitive documents are shared via email, WhatsApp, cloud storage, and government portals — with PII fully exposed. Aadhaar numbers in job applications. PAN cards in rental agreements. Bank details in invoices. Medical records in insurance claims.

Existing solutions either:
- **Send your data to their cloud** — defeating the purpose of redaction
- **Require enterprise contracts** — inaccessible to individuals and small teams
- **Cover only Western PII formats** — missing Indian identifiers entirely
- **Offer manual redaction only** — slow, error-prone, inconsistent

Ciphera solves all of this. It runs entirely in your environment. It understands Indian document formats natively. It automates detection so nothing slips through. And it is free.

---

## Features

### Core Redaction
- **Automated PII Detection** — four-stage ensemble pipeline with confidence scoring
- **Indian PII Native Support** — Aadhaar (Verhoeff checksum), PAN, GSTIN, IFSC, Voter ID, Passport, Vehicle Registration
- **Global PII Coverage** — email, phone, dates, names, addresses, SSN, credit cards, URLs, IP addresses
- **Format-Aware Validation** — structural validation prevents false positives, not just pattern matching

### Redaction Modes
- **Text Redaction** — replaces detected entities with typed placeholders `[AADHAAR_1]`
- **Visual Canvas Redaction** — pixel-level black bar redaction for PDFs and images
- **Synthetic Substitution** — replaces PII with realistic fake Indian data, preserving document readability
- **Selective Redaction** — human-in-the-loop review before any entity is removed

### Processing
- **Single Document** — redact any file in seconds
- **Batch Processing** — queue multiple documents, process with the same pipeline, export as ZIP
- **Multi-format Support** — PDF, DOCX, TXT, CSV, JSON, MD, PNG, JPG, TIFF

### Developer Tools
- **REST API** — authenticated endpoints for pipeline integration from any language
- **Per-key Rate Limiting** — manage API access with granular controls
- **Audit Logs** — full session history with entity counts, timestamps, confidence scores
- **Docker Deployment** — fully air-gapped, on-premise via Docker Compose

### Compliance & Security
- **Zero Data Retention** — nothing is stored after session ends
- **Local Inference Only** — all ML models run on your machine
- **DPDP Act 2023 Aligned** — built for Indian data protection law
- **GDPR Article 25 Compliant** — privacy by design and default
- **Full Audit Trail** — every redaction session logged with integrity verification

---

## Detection Pipeline

Ciphera uses a **four-stage weighted voting ensemble**. Every entity must pass through all four stages. The final verdict is determined by weighted consensus — not a single model's output.

```
INPUT DOCUMENT
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ STAGE 01 — Regex Engine                   Weight: 1.4×  │
│ Format-aware pattern matching for structured Indian PII │
│ Aadhaar: Verhoeff checksum · PAN: alphanumeric struct   │
│ GSTIN: state code validation · IFSC: bank code verify   │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 02 — Presidio NLP                   Weight: 1.0× │
│  Microsoft's PII detection with 28 custom recognisers   │
│  Handles unstructured text · Global PII patterns        │
│  Phone · Credit card · Email · SSN · Medical ID · URL   │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 03 — spaCy NER                      Weight: 0.9× │
│  en_core_web_lg transformer — context-aware recognition │
│  Persons · Organisations · Locations · Dates            │
│  Understands surrounding text to prevent false positives│
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 04 — Voting Ensemble                     VERDICT │
│  Weighted score merge across all three engines          │
│  Type-lock at ≥0.80 regex confidence                    │
│  Prevents context reclassification of structured IDs    │
└─────────────────────────────────────────────────────────┘
      │
      ▼
REDACTED OUTPUT  ·  AUDIT LOG  ·  CONFIDENCE REPORT
```

**Confidence threshold:** An entity is redacted only when the ensemble confidence score reaches **≥ 0.80**. Below that threshold, the entity is flagged for human review rather than automatically removed.

**Type-lock:** If Stage 01 identifies a token as `AADHAAR` with ≥ 0.80 confidence, Stage 04 locks that classification. Stage 03 cannot reclassify it as a `DATE` or `LOCATION` based on surrounding context alone. This prevents a known failure mode in pure NER-based systems.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S MACHINE                           │
│                                                                 │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │   FRONTEND               │    │   BACKEND                │   │
│  │   Next.js 15             │    │   FastAPI (Python)       │   │
│  │   React 19               │◄──►|   Presidio NLP           │   │
│  │   TypeScript             │    │   spaCy Transformer      │   │
│  │   Tailwind CSS           │    │   Tesseract OCR          |   │
│  │                          │    │   Custom Regex Engine    │   │
│  │   · Dashboard            │    │                          │   │
│  │   · Redact Page          │    │   PostgreSQL (SQLite)    │   │
│  │   · Batch Processing     │    │   Audit Log Storage      │   │
│  │   · Settings             │    │   Session Management     │   │ 
│  └──────────────────────────┘    └──────────────────────────┘   │
│                                                                 │
│                  ↕ 0 bytes leave this boundary                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

NO EXTERNAL API CALLS · NO CLOUD STORAGE · NO TELEMETRY
```

Everything — the frontend, the detection models, the database, the file processing — runs within a single Docker Compose environment on your machine. The architecture is designed so that it is physically impossible for document content to leave your environment during normal operation.

---

## Getting Started

### Prerequisites

```
Node.js          ≥ 18.0.0
Python           ≥ 3.10
Docker           ≥ 24.0 (recommended)
Docker Compose   ≥ 2.0  (recommended)
```

For running without Docker:
```
PostgreSQL       ≥ 14  (or SQLite for local dev)
Tesseract OCR    ≥ 5.0
```

---

### Installation

**Option 1 — Docker Compose (Recommended)**

This is the fastest path to a fully working, air-gapped deployment.

```bash
# Clone the repository
git clone https://github.com/Sibtain-Nayani/Ciphera.git
cd Ciphera/v3

# Copy environment template
cp .env.example .env

# Start all services
docker compose up --build
```

Ciphera will be available at `http://localhost:3000`

The first build downloads the spaCy language model (`en_core_web_lg`, ~560MB). Subsequent starts are fast.

---

**Option 2 — Manual Installation**

**Backend:**
```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Download spaCy model
python -m spacy download en_core_web_lg

# Set up database
python -m alembic upgrade head

# Start backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.local.example .env.local

# Start development server
npm run dev
```

Frontend: `http://localhost:3000`
Backend API: `http://localhost:8000`
API Docs: `http://localhost:8000/docs`

---

### Docker Deployment

**Production (air-gapped):**
```bash
# Build production images
docker compose -f docker-compose.prod.yml build

# Run in detached mode
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose logs -f
```

**Environment variables:**

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `sqlite:///./ciphera.db` |
| `SECRET_KEY` | Session secret key | Generate with `openssl rand -hex 32` |
| `CONFIDENCE_THRESHOLD` | Minimum confidence for auto-redaction | `0.80` |
| `MAX_FILE_SIZE_MB` | Maximum upload file size | `50` |
| `AUDIT_LOG_RETENTION_DAYS` | How long to keep session logs | `90` |

---

## Usage

### Single Document Redaction

1. Navigate to **Redact** in the sidebar
2. Upload a document (PDF, DOCX, TXT, image)
3. Ciphera scans the document through all four pipeline stages
4. Detected entities are highlighted with their type and confidence score
5. Review detections — approve, reject, or modify any entity
6. Click **Redact** to apply
7. Download the redacted document

**Supported input formats:** PDF, DOCX, DOC, TXT, CSV, MD, PNG, JPG, JPEG, TIFF, BMP

**Output formats:** PDF (flattened), DOCX, TXT

---

### Batch Processing

1. Navigate to **Batch** in the sidebar
2. Drop multiple files or click to select
3. Choose export format (.TXT, .PDF, .DOCX, .CSV, .MD)
4. Click **Start Batch**
5. All files process through the same four-stage pipeline
6. Download as ZIP when complete

Batch processing applies your configured redaction rules automatically — no per-document review unless you enable human-in-the-loop mode in Settings.

---

### Visual Canvas Redaction

For PDFs and images where text extraction is unreliable (scanned documents, complex layouts):

1. Open a document in the **Redact** page
2. Switch to **Canvas Mode**
3. Detected text regions are highlighted automatically
4. Draw additional redaction boxes manually over any area
5. Black bars are applied at the pixel level
6. Export as a flattened PDF — the underlying text is permanently destroyed

This mode uses Tesseract OCR for text detection before applying the pipeline.

---

### Synthetic Substitution

Instead of replacing PII with `[PLACEHOLDER]` tags, Ciphera can substitute realistic fake Indian data:

- Aadhaar numbers → Structurally valid fake Aadhaar (passes Verhoeff checksum)
- PAN → Valid format fake PAN
- Names → Common Indian names from a local dataset
- Phone numbers → Valid Indian mobile number patterns
- Addresses → Synthetic Indian addresses

Documents remain readable and structurally coherent — useful for creating test datasets or sharing document layouts without real personal data.

Enable in **Settings → Detection → Redaction Rules → Mode → Substitute**.

---

## API Reference

All endpoints require an API key passed as a header: `X-API-Key: ck_live_...`

Generate keys in **Settings → API Keys**.

---

### `POST /api/v3/public/redact`

Redact PII from text and return the sanitised output.

**Request:**
```bash
curl -X POST http://localhost:8000/api/v3/public/redact \
  -H "X-API-Key: ck_live_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "Aadhaar: 4532 8812 9901, PAN: ABCPD1234E"}'
```

**Response:**
```json
{
  "redacted_text": "Aadhaar: [AADHAAR_1], PAN: [PAN_1]",
  "entities_found": 2,
  "entities": [
    {
      "type": "AADHAAR",
      "original": "4532 8812 9901",
      "replacement": "[AADHAAR_1]",
      "confidence": 0.99,
      "start": 9,
      "end": 23
    },
    {
      "type": "PAN",
      "original": "ABCPD1234E",
      "replacement": "[PAN_1]",
      "confidence": 0.97,
      "start": 30,
      "end": 40
    }
  ],
  "processing_ms": 38,
  "pipeline_version": "3.0.0"
}
```

---

### `POST /api/v3/public/analyze`

Detect entities without redacting. Returns detection report only.

```bash
curl -X POST http://localhost:8000/api/v3/public/analyze \
  -H "X-API-Key: ck_live_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "Call me at +91 98765 43210"}'
```

---

### `POST /api/v3/synthesize`

Replace PII with synthetic Indian data instead of placeholders.

```bash
curl -X POST http://localhost:8000/api/v3/synthesize \
  -H "X-API-Key: ck_live_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "Name: Priya Sharma, Phone: +91 98765 43210"}'
```

---

### `POST /api/v3/classify`

Auto-detect document type and return its PII risk profile.

```bash
curl -X POST http://localhost:8000/api/v3/classify \
  -H "X-API-Key: ck_live_..." \
  -F "file=@document.pdf"
```

---

### Rate Limiting

| Plan | Requests/minute | Max file size |
|---|---|---|
| Default | 60 | 50MB |
| Custom (self-hosted) | Configurable | Configurable |

Rate limit headers are returned on every response:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1716800400
```

---

## Configuration

### Detection Engine

Configure per-entity redaction behaviour in **Settings → Detection → Redaction Rules**:

| Entity Type | Available Actions |
|---|---|
| Names | Redact · Substitute · Ignore |
| Aadhaar | Redact · Partial mask (last 4 visible) · Substitute |
| PAN | Redact · Substitute · Ignore |
| Phone | Redact · Partial mask · Substitute |
| Email | Redact · Domain-only mask · Substitute |
| Date of Birth | Redact · Year-only · Substitute |
| Bank Account | Redact · Last 4 visible · Substitute |
| GSTIN | Redact · Substitute · Ignore |
| IFSC | Redact · Substitute · Ignore |
| Voter ID | Redact · Substitute |
| Passport | Redact · Substitute |
| Address | Redact · Substitute · City-only |

### Confidence Threshold

Default: `0.80`

Entities below this threshold are flagged for human review rather than automatically redacted. Lower this value to catch more potential PII (increases false positives). Raise it for higher precision (may miss ambiguous cases).

Configure in `.env`:
```
CONFIDENCE_THRESHOLD=0.80
```

Or per-request via API:
```json
{
  "text": "...",
  "options": {
    "confidence_threshold": 0.75
  }
}
```

---

## Supported PII Types

### Indian PII

| Type | Validation Method | Example |
|---|---|---|
| Aadhaar | Verhoeff checksum + format | `4532 8812 9901` |
| PAN | Alphanumeric structure + format | `ABCPD1234E` |
| GSTIN | State code + PAN embed + checksum | `27AADCB2230M1ZP` |
| IFSC | Bank code + branch regex | `SBIN0001234` |
| Voter ID | State prefix + alphanumeric | `ABC1234567` |
| Passport | Country format + checksum | `A1234567` |
| Vehicle Reg | State code + district + serial | `MH12AB1234` |
| Driving Licence | State + RTO + format | `MH0120110012345` |

### Global PII

| Category | Types Covered |
|---|---|
| Contact | Phone (Indian + international), Email, URL |
| Identity | Names (person, organisation), SSN/TIN |
| Financial | Credit/debit card, Bank account, SWIFT/BIC |
| Medical | Medical licence, NPI, Health ID |
| Digital | IP address, MAC address, Device ID |
| Temporal | Date of birth, Age, Dates in context |
| Location | Address, Coordinates, Postcode |

**Total recognisers active: 28**

---

## Compliance

### DPDP Act 2023 (Digital Personal Data Protection Act)

Ciphera is built specifically for compliance with India's DPDP Act 2023:

- **Section 4** — Processing of personal data only for lawful purposes. Ciphera processes data only for the explicit purpose of redaction, with no secondary use.
- **Section 6** — Consent-based processing. All redaction is initiated by the data principal (the user).
- **Section 8** — Accuracy and storage limitation. No data is stored after session completion.
- **Section 17** — Data localisation. All processing happens on the user's infrastructure.

### GDPR (General Data Protection Regulation)

- **Article 25** — Privacy by design and default. Ciphera's architecture makes data exposure the exception, not the norm.
- **Article 17** — Right to erasure. Session data is destroyed on session end. No recovery path exists.
- **Article 32** — Security of processing. Local inference eliminates transmission-layer risk.

### ISO 27001

Ciphera's architecture supports ISO 27001 compliance programmes:

- Access control via API key management
- Audit trail for all processing sessions
- Data minimisation by design
- Incident logging via session history

### Audit Logs

Every session generates an immutable audit record containing:

```json
{
  "session_id": "RUN-5130",
  "timestamp": "2026-05-25T18:59:05Z",
  "document_hash": "sha256:a3f9...",
  "entities_detected": 25,
  "entities_redacted": 25,
  "pipeline_version": "3.0.0",
  "confidence_threshold": 0.80,
  "processing_ms": 1243,
  "data_transmitted": 0,
  "integrity_hash": "sha256:9d2c..."
}
```

Audit logs are stored locally in SQLite and exportable as PDF or CSV per DPDP/GDPR audit requirements.

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| Next.js | 15 | React framework, App Router |
| React | 19 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 3 | Styling |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| FastAPI | 0.110+ | REST API framework |
| Python | 3.10+ | Runtime |
| Presidio Analyzer | 2.2+ | NLP-based PII detection |
| spaCy | 3.7+ | Named entity recognition |
| en_core_web_lg | 3.7+ | Transformer language model |
| Tesseract OCR | 5.0+ | Image/PDF text extraction |
| PyMuPDF (fitz) | 1.23+ | PDF processing |
| SQLAlchemy | 2.0+ | ORM |
| Alembic | 1.13+ | Database migrations |

### Infrastructure
| Technology | Purpose |
|---|---|
| Docker | Containerisation |
| Docker Compose | Multi-service orchestration |
| PostgreSQL | Production database |
| SQLite | Development / embedded database |
| Nginx | Reverse proxy (production) |

---


## Contributing

Ciphera is open source. Contributions are welcome — especially for:

- **New Indian PII recognisers** — Driving licence formats, ration card, etc.
- **Language support** — Hindi, Tamil, Telugu, Bengali document support
- **Performance improvements** — Pipeline latency reduction
- **Bug reports** — Open an issue with steps to reproduce

**Before contributing:**

```bash
# Fork the repository
# Create a feature branch
git checkout -b feat/your-feature-name

# Make your changes
# Run tests
cd backend && pytest
cd frontend && npm run test

# Submit a pull request
```

**Coding standards:**
- Backend: Black formatter, type hints required on all functions
- Frontend: ESLint + Prettier, TypeScript strict mode
- All new PII recognisers must include test cases with real format examples

---

## Roadmap

- [x] **v3.1** — Hindi/Devanagari document support + bilingual pipeline + signed audit reports
- [x] **v3.2** — JWT auth + Google OAuth + multi-tenant orgs + API keys v2
- [ ] **v3.3** — Browser extension for inline redaction
- [ ] **v3.4** — CLI tool for pipeline integration
- [ ] **v3.5** — Webhook support for batch completion events
- [ ] **v4.0** — On-device LLM for contextual PII detection

---


<div align="center">

*No data transmitted externally. Runs entirely on your infrastructure.*
*Audit log closed. Zero bytes retained.*

---

```
> SESSION TERMINATED · 0 BYTES RETAINED · AUDIT LOG CLOSED
```

</div>