# **CipheraV2 — Enterprise Data Sanitization Pipeline**

Ciphera is a robust, fail-secure anonymization engine and Security Operations platform designed to detect and redact Personally Identifiable Information (PII) entirely offline. 

> [!NOTE]
> **Project History**: The original **Ciphera (V1)** was a functional prototype meant to test the feasibility of Microsoft's Presidio SDK. That prototype has been sunset. The project has fully shifted to **CipheraV2**, which introduces an Enterprise-grade Next.js (App Router) interface, stream-level PDF bytes destruction, and true Zero-Trust local inference.

---

## **Distinctive Features of CipheraV2**

- **Zero-Trust Local Inference:** All NLP entity recognition and RegEx matching runs purely on your local hardware using FastAPI and SpaCy RoBERTa. No API egress. No leaks.
- **Fail-Secure Architecture:** The UI gates any data export. If the backend Presidio engine goes offline, exporting is immediately blocked to prevent accidental unredacted data leakage.
- **Compliance Audit Ledger:** Generates structured JSON logging for GDPR/SOC2 transparency natively stored in a Zustand session log, accessible via the Dashboard.
- **Stream-Level PDF Sanitization:** Utilizes PyMuPDF (`fitz`) and `python-multipart` to directly manipulate PDF streams. It applies vector blackouts or masks at the byte level rather than destructively rasterizing the file into an image.
- **Multi-Modal Target Parsing:** 
  - **Images (.png, .jpg):** Client-side WebAssembly OCR combined with HTML5 Canvas (`react-konva`).
  - **Raw Text/CSVs:** Real-time Abstract Syntax Tree (AST) overlay in a secure React editor buffer.
  - **PDFs:** High-fidelity conversion for inference and secure vector write-back.
- **SOC-Style Dashboard:** Features live telemetry metrics, an active threat-vector log, and a quick-action dropzone for drag-and-drop document sanitization.
- **Human-in-the-Loop (HIL):** Mandatory visual review gates ensure no document is blind-exported.
- **Global Command Palette:** Hit `Ctrl+K` from anywhere in the app to jump between workspaces, clear your memory buffer, or access parser settings.

---

## **Tech Stack**

* **Frontend:** Next.js 14 (App Router), React, Tailwind CSS, Framer Motion, Zustand (State Management), React-Konva, Lucide Icons.
* **Backend:** FastAPI, Uvicorn, Microsoft Presidio Analyzer (`presidio-analyzer`), SpaCy (`en_core_web_trf`), PyMuPDF (`fitz`), Pydantic.
* **Language:** TypeScript & Python.

---

## **Setup and Configuration Guide**

### **Step 1: Backend Inference Engine (FastAPI)**

The backend runs the Presidio Analyzer and the PDF byte-manipulator. It must be active to allow data exports.

1. **Navigate to the Backend API Directory:**
   ```bash
   cd CipheraV2/ciphera_api
   ```

2. **Create and Activate a Virtual Environment:**
   ```bash
   python -m venv venv
   
   # Windows:
   venv\Scripts\activate
   
   # Mac/Linux:
   source venv/bin/activate
   ```

3. **Install Core Requirements & NLP Models:**
   ```bash
   pip install -r requirements.txt
   
   # You must download the SpaCy transformer model used by Presidio:
   python -m spacy download en_core_web_trf
   ```

4. **Run the API Server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   *The backend will be available at `http://localhost:8000`.*

---

### **Step 2: Frontend Dashboard (Next.js)**

1. **Navigate to the V2 Root Directory:**
   Open a new terminal window and run:
   ```bash
   cd CipheraV2
   ```

2. **Install Node Dependencies:**
   ```bash
   npm install
   ```

3. **Run the Development Workspace:**
   ```bash
   npm run dev
   ```

4. **Access the App:**
   Open [http://localhost:3000](http://localhost:3000) in your browser. The frontend will automatically route API requests to your local Python server.

---

## **Security & Privacy Best Practices**

These tools are designed to assist with data anonymization in enterprise environments. When handling real, sensitive data:
* **Audit Logs:** Ensure any logs generated during the session are reviewed before clearing the workspace.
* **Local Sandboxing:** Keep your backend running on isolated hardware instances or VMs to maintain strict Zero-Trust architecture.
* **Offline Execution:** Once dependencies and the SpaCy model are downloaded via pip, the entire pipeline operates fully disconnected from the internet.