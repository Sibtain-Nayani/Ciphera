# Ciphera V3 — UI/UX Redesign Specification & Architecture Guide

> **Target Audience:** Frontend Engineers & UI/UX Designers  
> **Document Purpose:** Exhaustive specification of all pages, components, data flows, visual design tokens, interaction states, and backend contracts required to completely redesign and modernize the Ciphera web platform.

---

## 1. System Identity & Core Philosophy

**Ciphera** is an enterprise-grade **Zero-Trust Intelligent PII Anonymization & Redaction Platform**.

### Key Architectural Pillars
1. **Maker / Checker Separation:** The engine that finds and redacts PII (*Maker*) is independently audited by an adversarial zero-trust verification pipeline (*Checker*) before any document can be downloaded.
2. **Cryptographic Proof of Destruction:** Redaction is not visual masking; it is the irreversible destruction of underlying text objects, font streams, vector layers, hidden OCR text, and EXIF metadata, certified by SHA-256 HMAC compliance signatures.
3. **Hybrid Multi-Modal Pipeline:** Combines Transformer NLP (spaCy / RoBERTa), structural regexes, Devanagari Hindi support, OpenCV facial recognition, and spatial columnar layout inference.

---

## 2. Global Design System & Visual Tokens

The redesign should maintain a sleek, high-trust, dark-mode cybersecurity aesthetic with sharp typography, subtle glassmorphism, and clear visual hierarchy.

### 2.1 Color Palette

```
┌───────────────────────────┬─────────────┬────────────────────────────────────────┐
│ Role                      │ Hex Code    │ Usage                                  │
├───────────────────────────┼─────────────┼────────────────────────────────────────┤
│ Background (Base)         │ #0A0A0A     │ App background canvas                  │
│ Surface (Card/Panel)      │ #121212     │ Sidebar, modals, toolbars, card tiles  │
│ Surface Highlight         │ #1A1A1A     │ Hover states, active list rows         │
│ Border (Subtle)           │ #242424     │ Panel separators, divider lines        │
│ Border (Active/Focus)     │ #3A3A3A     │ Input focus, card outlines             │
│ Primary Accent (Brand)    │ #FFA500     │ Primary CTAs, key highlights, badges   │
│ Primary Accent Hover      │ #FFB733     │ Button hover state                     │
│ Success / Verified        │ #10B981     │ Passed verification, zero leaks        │
│ Warning / Review Needed   │ #F59E0B     │ Low confidence entities, review alerts │
│ Danger / Blocked          │ #EF4444     │ Verification leaks caught, errors      │
│ Info / Processing         │ #3B82F6     │ Active workers, in-flight processing   │
│ Text (Primary)            │ #FFFFFF     │ Headings, primary values               │
│ Text (Secondary)          │ #9CA3AF     │ Descriptions, subtitles, labels        │
│ Text (Muted/Mono)         │ #6B7280     │ Timestamps, offsets, hex codes         │
└───────────────────────────┴─────────────┴────────────────────────────────────────┘
```

### 2.2 Entity Color Matrix (Tokens & Canvas Overlays)

Every PII entity type has an assigned distinct color across the workspace, token list, and confidence slider:

| Entity Type | Category | Hex Code | Icon Identifier | Label Display |
| :--- | :--- | :--- | :--- | :--- |
| `AADHAAR_NUMBER` | Indian PII | `#F97316` | `Fingerprint` | Aadhaar Card |
| `PAN_NUMBER` | Indian PII | `#EAB308` | `BookKey` | PAN Card |
| `GST_NUMBER` | Indian PII | `#2DD4BF` | `Building2` | GST / GSTIN |
| `IFSC_CODE` | Indian PII | `#38BDF8` | `Landmark` | IFSC Routing Code |
| `VOTER_ID` | Indian PII | `#EC4899` | `Vote` | Voter ID (EPIC) |
| `IN_PASSPORT` | Indian PII | `#818CF8` | `MapPin` | Passport Number |
| `IN_VEHICLE_REG` | Indian PII | `#FB7185` | `Car` | Vehicle Registration |
| `UPI_ID` | Financial | `#A78BFA` | `Hash` | UPI Handle |
| `BANK_ACCOUNT` | Financial | `#34D399` | `Landmark` | Bank Account Number |
| `CREDIT_CARD` | Financial | `#F59E0B` | `CreditCard` | Credit / Debit Card |
| `SSN` | Financial | `#F472B6` | `Lock` | SSN / TIN |
| `PERSON` | Identity | `#3B82F6` | `User` | Name (Individual) |
| `EMAIL_ADDRESS` | Contact | `#60A5FA` | `Mail` | Email Address |
| `PHONE_NUMBER` | Contact | `#34D399` | `Phone` | Phone Number |
| `DATE_OF_BIRTH` | Identity | `#F87171` | `Calendar` | Date of Birth |
| `URL` | Network | `#06B6D4` | `Globe` | URL / Web Address |
| `IP_ADDRESS` | Network | `#A78BFA` | `Network` | IP Address |
| `DRIVING_LICENCE` | Indian PII | `#F472B6` | `Car` | Driving Licence |
| `PIN_CODE` | Location | `#60A5FA` | `MapPin` | Postal PIN Code |

### 2.3 Typography & Hierarchy
* **UI Text:** `Inter`, system sans-serif (clean, high legibility).
* **Code / Entity Offsets / Hashes:** `JetBrains Mono` or `Fira Code` (for document text tokens, confidence percentages, bounding box coordinates, and cryptographic verification stamps).

---

## 3. Environment Setup for Frontend Development

When you clone the repository:
```bash
git checkout master
git pull origin master

# Spin up full stack (PostgreSQL, Redis, FastAPI Backend, Celery Worker, Next.js Frontend)
docker compose up --build
```
* **Frontend Dev URL:** `http://localhost:3000` (hot-reloading enabled)
* **Backend API URL:** `http://localhost:8000` (FastAPI Swagger docs at `http://localhost:8000/docs`)
* **Database:** PostgreSQL on port `5432` (`ciphera_db`)
* **Redis:** Port `6379`

---

## 4. Comprehensive Page-by-Page UI/UX Specifications

```
                              SITE MAP & APP STRUCTURE
                                         │
    ┌──────────────┬─────────────────────┼─────────────────────┬──────────────┐
    ▼              ▼                     ▼                     ▼              ▼
1. Workspace   2. Dashboard          3. Batch              4. Org & Auth  5. API & Keys
  (/redact)      (/dashboard)          (/batch)              (/account)     (/settings)
```

---

### Page 1: Redaction Workspace (`/redact`) — Primary App Engine

This is the core flagship view of Ciphera. It handles single document upload, multi-modal visualization, entity tuning, face redaction, and verified export.

#### A. Header / Top Navigation Bar
* **File Info Pill:** File name, file format badge (`.PDF`, `.PNG`, `.TXT`, etc.), page count (`p. 1 of 4`).
* **View Switcher:**
  * `Visual Canvas Mode`: For PDFs and images with interactive bounding boxes.
  * `Text Token Stream Mode`: For plain text, Markdown, DOCX, CSV with highlighted tokens.
  * `Split-Screen Mode`: Side-by-side comparison (Original unredacted vs Redacted preview).
* **Multilingual Mode Badge:** Shows `English`, `Hindi (Devanagari)`, or `Mixed (Bilingual)` with quick toggle.
* **Auto-Classification Alert Banner:** If auto-detected (e.g. `Tax Form (Form 16)`, `Aadhaar E-Card`, `Salary Schedule`), displays a dismissible contextual badge with one-click recommended rule activation.
* **Action CTAs:**
  * `Review Entities` (triggers `EntityReviewModal`).
  * `Detect Faces` (runs OpenCV face detection and creates blackout boxes over detected faces).
  * `Export Document` (triggers `ExportModal`).

#### B. Left Control Panel (Rules, Thresholds & Custom Rules)
* **Confidence Threshold Slider:** Float slider from `0.00` to `1.00` (Default `0.50`). Real-time filtering of active entity detections based on ML confidence score.
* **Entity Category Accordions:**
  * Identity & Contact (Names, Email, Phone, Date of Birth).
  * Financial (Credit Cards, Bank Accounts, SSN).
  * Indian PII (Aadhaar, PAN, GST, IFSC, Voter ID, Passport, Driving Licence, PIN Code).
  * Network & System (URLs, IP Addresses).
* **Per-Rule Toggle Switch:** Quick on/off toggle and custom action picker (`Replace with [REDACTED]`, `Mask with *******`, `Solid Blackout`).
* **Custom Regex Rule Builder:**
  * "+ Add Custom Rule" button opening inline dialog.
  * Form inputs: Rule Name, Regex Pattern, Custom Color picker, Preview test string.

#### C. Main Work Area (Visual Canvas & Text Engine)
* **PDF / Image Visual Canvas (`CanvasEngine.tsx`):**
  * High-res canvas rendering (via PDF.js at 3.0x scale).
  * Draggable, resizable bounding-box overlays for every detected PII entity.
  * Floating toolbar on token selection: Change Action (`Blackout` / `Mask` / `Replace`), Adjust bbox bounds, Delete/Reject redaction.
  * Manual Box Drawing: User can click-and-drag on empty areas to manually create custom redaction boxes.
  * Multi-page pagination bar (`< Page 1 of 6 >` with thumbnail preview strip).
* **Text Token Stream View (`AnimatedToken.tsx`):**
  * Interactive inline text rendering where words are split into normal text and highlighted PII tokens.
  * Token hover tooltips showing entity type, score bar (`98% confidence`), detection source (`Regex Engine`, `spaCy Transformer`, `Presidio`), and reasoning.

#### D. Human-in-the-Loop Maker/Checker Modal (`EntityReviewModal.tsx`)
* **Header:** Summary stats (e.g., `18 Entities Discovered — 16 Approved, 2 Rejected`).
* **Search & Filter:** Search by text value, filter by entity type, sort by confidence score or page order.
* **Entity Table Rows:**
  * Multi-select checkbox (`Approve for Destruction` vs `Keep Plaintext`).
  * Entity value & Devanagari indicator badge.
  * Confidence meter bar (`Green >= 85%`, `Amber >= 65%`, `Red < 65%`).
  * Action Picker: Switch between `Replace`, `Mask`, and `Blackout`.
* **Footer:** "Accept & Apply Redactions" CTA that saves human modifications to `PUT /api/v3/documents/{id}/entities`.

#### E. Verified Export Modal (`ExportModal.tsx`)
* **Page Selection (Multi-page PDFs):**
  * `All Pages` (Export full document).
  * `Current Page Only` (Export single active page).
  * `Custom Page Range` (Input box: `1-3, 5, 7` with real-time range validator).
* **Format Selection:** `.PDF` (Native vector destruction) or `.PNG` (Zip archive of rasterized images).
* **Zero-Trust Independent Verification Guarantee Banner:**
  * Displays active verification status:
    * `Layer 1: Geometry Coverage` (Descender padding & coordinate bounds check).
    * `Layer 2: Visual OCR Text Purge` (Zero residual sensitive characters in pixel raster).
    * `Layer 3: Defragmented Regex Audit` (Spaced/fragmented token leak detection).
* **Export Progress States:**
  * `Queued on secure worker...`
  * `Applying native coordinate redactions...`
  * `Verifying L1 Geometry & L2 Visual OCR text purge...`
  * `Verifying L3 Defragmented Regex & Entropy...`
  * `Zero-Trust Verification Passed! Downloading...`
  * If a leak is caught: Red error card displaying exact leak type (e.g. `Verification Failed: Residual PAN_CARD text detected in Layer 2`).

---

### Page 2: Compliance & Audit Dashboard (`/dashboard`)

This page provides executive and compliance reporting for data protection officers.

#### Required Visual Components:
1. **Metric Overview Cards:**
   * `Total Documents Processed` (with weekly delta percentage).
   * `Total PII Entities Redacted` (total count).
   * `Zero-Trust Pass Rate` (e.g., `100.0%`).
   * `Active API Keys & Integrations`.
2. **Entity Distribution Charts:**
   * Breakdown of discovered PII types (Bar chart / Donut chart showing Aadhaar, PAN, Emails, Bank Accounts, Names).
3. **Cryptographically Signed Audit Log Table:**
   * Columns: `Timestamp`, `Document ID`, `File Name`, `Entities Scrubbed`, `Verification Status` (`VERIFIED_SAFE`), `Operator / API Key`, `SHA-256 HMAC Hash`.
   * Row action: View verification certificate breakdown.
4. **"Generate Signed Compliance Report" Action:**
   * Calls `POST /api/v3/audit/report`.
   * Generates and downloads a formal PDF certificate with cryptographic headers (`X-Ciphera-Report-ID`, `X-Ciphera-Content-Hash`) for regulatory submission (DPDP Act 2023, GDPR Article 32, HIPAA).

---

### Page 3: Batch Processing (`/batch`)

For enterprise users redacting high volumes of files concurrently.

#### Required Visual Components:
1. **Multi-File Drag & Drop Upload Zone:**
   * Accepts multiple PDFs, Images, and Text files simultaneously.
2. **Batch Queue Table:**
   * File name, file size, page count.
   * Template selector dropdown (e.g., `Strict Financial Policy`, `KYC Customer Onboarding`, `HR Recruitment`).
   * Real-time progress bar per file (`Uploading` $\rightarrow$ `Analyzing` $\rightarrow$ `Redacting` $\rightarrow$ `Verifying` $\rightarrow$ `Completed`).
   * Status badges (`COMPLETED`, `PROCESSING`, `FAILED`).
3. **Batch Action Bar:**
   * "Process All Files" CTA.
   * "Download All as ZIP" (combines all verified redacted PDFs + aggregated audit report into a single archive).

---

### Page 4: Organization & Access Management (`/account`, `/account/organisation`)

For multi-tenant team management and security controls.

#### Required Visual Components:
1. **Organization Profile Card:**
   * Org name, unique Org ID, subscription tier (`Enterprise`).
2. **Policy Configuration Selector:**
   * `Strict Policy`: Redact all detected PII + all contextual names + strict face blurring.
   * `Balanced Policy` (Default): Redact government IDs, financials, contact info; keep non-sensitive business entity names.
   * `Permissive Policy`: Only redact high-risk financial and national identifiers.
3. **Team Members & RBAC Table:**
   * Columns: `User Name`, `Email`, `Role` (`Owner`, `Admin`, `Member`, `Viewer`), `Date Joined`, `Actions`.
   * "+ Invite Team Member" modal with role assignment.
4. **Security & Session Kill Switch:**
   * Active login sessions (IP address, browser, timestamp).
   * "Log Out All Other Sessions" button (`POST /api/v3/auth/logout-all`).

---

### Page 5: Developer API Keys & Webhooks (`/account/api-keys`, `/settings`)

For programmatic integration and backend pipelines.

#### Required Visual Components:
1. **API Key Management:**
   * List of active keys with masked prefixes (e.g. `ciph_live_9f8a...`).
   * "+ Create New API Key" modal (Key Name, Expiry selector, Scopes: `documents:write`, `audit:read`).
   * One-time copy modal displaying full generated API key.
   * Key usage meter (requests per month, rate limit bar).
2. **Webhook Manager:**
   * Registered webhook endpoints list.
   * "+ Add Webhook" modal (Target URL, Secret key, Event checkboxes: `document.completed`, `document.failed`, `verification.leak_detected`).
   * "Send Test Ping" button with live status response code preview (`200 OK`).

---

### Page 6: Authentication & Landing (`/login`, `/register`, `/`, `/privacy`, `/terms`)

1. **Login / Register Pages:**
   * Clean dark-mode card with subtle orange gradient accents.
   * Email / Password inputs with validation.
   * "Continue with Google" OAuth 2.0 button (`/api/v3/auth/google/init`).
   * "Continue as Guest" one-click trial sandbox button.
2. **Landing Page (`/`):**
   * Hero section with animated document before/after interactive slider.
   * Feature showcases: Zero-Trust Verification, Native PDF Destruction, Indian PII Support, Cryptographic Compliance.
   * Live interactive mini-demo widget.

---

## 5. TypeScript Data Contracts (API Interfaces)

Use these exact models located in `frontend/src/lib/v3ApiClient.ts` and `frontend/src/store/`:

```typescript
export interface BoundingBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface RedactionEntity {
    id: string;
    entity_type: string;     // e.g. "AADHAAR_NUMBER", "PAN_NUMBER", "PERSON"
    text: string;            // Original entity text string
    score: number;           // Float 0.0 to 1.0 (confidence score)
    page_num: number;        // 1-indexed page number
    bbox?: BoundingBox;      // Normalized PDF coordinates (points)
    start_index?: number;    // Character offset start in text view
    end_index?: number;      // Character offset end in text view
    status: 'pending' | 'accepted' | 'rejected' | 'modified';
}

export interface CanonicalBlock {
    page_num: number;
    text: string;
    bbox?: BoundingBox;
    start_index: number;
    end_index: number;
}

export interface CanonicalDocument {
    metadata: Record<string, any>;
    blocks: CanonicalBlock[];
    full_text: string;
    page_count: number;
}

export interface JobStatusResponse {
    job_id: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    error_message: string | null;
}
```

---

## 6. Frontend File Structure & Key Paths

```
frontend/src/
├── app/
│   ├── page.tsx                     # Landing & Marketing Showcase
│   ├── redact/page.tsx              # Main Redaction Workspace
│   ├── dashboard/page.tsx           # Compliance, Stats & Signed Audit Reports
│   ├── batch/page.tsx               # Multi-document Bulk Redaction
│   ├── login/page.tsx               # Login & Google OAuth
│   ├── register/page.tsx            # User Registration
│   ├── account/
│   │   ├── page.tsx                 # Account settings & session management
│   │   ├── organisation/page.tsx    # Multi-tenant RBAC & team management
│   │   └── api-keys/page.tsx        # Developer API keys & usage metrics
│   └── settings/page.tsx            # Global preferences & Webhook manager
├── components/
│   ├── canvas/
│   │   ├── CanvasEngine.tsx         # Interactive PDF/Image canvas with bounding boxes
│   │   ├── FloatingToolbar.tsx      # Hover action bar for selected redaction boxes
│   │   └── ShapeLayer.tsx           # Konva/Fabric rendering overlay layer
│   ├── redact/
│   │   ├── AnimatedToken.tsx        # Interactive text token stream with tooltips
│   │   ├── ConfidenceSlider.tsx     # ML score threshold filter slider
│   │   ├── EntityReviewModal.tsx    # Human Maker/Checker verification table
│   │   ├── ExportModal.tsx          # Export range, format & Zero-Trust status
│   │   └── TemplateSelector.tsx     # Industry preset policy selector
│   └── layout/
│       ├── AppSidebar.tsx           # Collapsible dark navigation sidebar
│       └── CommandPalette.tsx       # Quick keyboard shortcut navigation (Cmd+K)
├── lib/
│   ├── api.ts                       # apiFetch helper with auto-refreshing JWT
│   ├── v3ApiClient.ts               # Core client for upload, entities, async redact
│   ├── designTokens.ts              # Global color, layout, and animation constants
│   ├── pdfRenderer.ts               # Client-side high-DPI PDF page rasterizer
│   └── ocrEngine.ts                 # Tesseract WASM client-side OCR fallback
└── store/
    ├── documentStore.ts             # Active document, entities, rules state
    ├── canvasStore.ts               # Canvas shapes, zoom, pan, active tool
    └── sessionStore.ts              # User authentication & token state
```

---

## 7. Frontend Redesign Checklist

- [ ] **Modern Visual Polish:** Adopt consistent dark theme `#0A0A0A` background with `#121212` cards, `#242424` subtle borders, and `#FFA500` brand accents.
- [ ] **Canvas Engine Interaction:** Ensure bounding boxes have clean resize handles, smooth drag interactions, and high-DPI crispness.
- [ ] **Zero-Trust Verification Visibility:** Display the 3-Layer verification badges prominently on `/redact`, `ExportModal`, and `/dashboard`.
- [ ] **Split-View Comparison:** Enhance the side-by-side comparison slider between unredacted input and redacted output.
- [ ] **Responsive Navigation:** Smooth collapsible sidebar with keyboard shortcuts (`Cmd+K` command palette, `Space` for pan tool, `B` for blackout box tool).
- [ ] **Telemetry & Error States:** Clear visual banners when the Independent Checker intercepts a leak with exact details instead of generic error toasts.
