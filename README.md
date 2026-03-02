# **Ciphera — PII Anonymization Suite**

This repository contains two distinct versions of the Ciphera project for data anonymization using Microsoft's Presidio SDK:
1. **Ciphera (V1)**: A React/Vite and FastAPI full-stack application.
2. **CipheraV2**: A modern Next.js and FastAPI application with enhanced document handling and a richer UI.

---

## **Part 1: Ciphera (V1)**

**Ciphera (V1)** is a web-based, interactive tool designed for data anonymization. It features a decoupled architecture with a React frontend and a FastAPI backend, utilizing Microsoft's Presidio SDK to detect and anonymize Personally Identifiable Information (PII).

### **Distinctive Features**
* **Standalone Frontend & Backend:** A lightweight React SPA paired with a robust Python API.
* **Authentication & Database:** Includes user authentication and stores data in a local SQLite database using SQLAlchemy.
* **Anonymization Support:** Text-based PII analysis and scrubbing.

### **Tech Stack**
* **Frontend:** React, Vite, Tailwind CSS, Framer Motion
* **Backend:** FastAPI, Microsoft Presidio Analyzer & Anonymizer, SQLAlchemy, SQLite
* **Language:** JavaScript (Frontend), Python (Backend)

### **Setup and Configuration Guide**

#### **Step 1: Backend (FastAPI)**
1. **Navigate to the Backend Directory:**
   ```bash
   cd Ciphera/backend
   ```
2. **Create and Activate a Virtual Environment:**
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Mac/Linux:
   source venv/bin/activate
   ```
3. **Install Dependencies:**
   ```bash
   pip install -r app/requirements.txt
   python -m spacy download en_core_web_lg
   ```
4. **Run the API Server:**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend will be available at `http://localhost:8000`.

#### **Step 2: Frontend (React + Vite)**
1. **Navigate to the Frontend Directory:**
   Open a new terminal window and run:
   ```bash
   cd Ciphera/frontend
   ```
2. **Install Node Dependencies:**
   ```bash
   npm install
   ```
3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
4. **Access the App:**
   Open the URL provided by Vite (usually `http://localhost:5173`) in your browser.

---

## **Part 2: CipheraV2**

**CipheraV2** is the evolution of Ciphera into a more robust, modern web application. It transitions the frontend to Next.js (App Router) and features an advanced, interactive UI with support for complex document visual redactions.

### **Distinctive Features**
* **Advanced Document Support:** Handle plain text along with PDFs (`pdfjs-dist`), Word documents (`.docx`), and scanned text images (via `tesseract.js` OCR).
* **Rich User Interface:** Polished UI built with Next.js App Router, Tailwind CSS, Framer Motion, and shadcn/ui.
* **Interactive Canvas:** Built-in document and image viewing/manipulation using Konva (`react-konva`), allowing for non-destructive redaction overlays.
* **Real-time Redaction AST:** The FastAPI backend returns an Abstract Syntax Tree (AST) of tokens, allowing the Next.js frontend to render precise redaction overlays line-by-line.

### **Tech Stack**
* **Frontend:** Next.js (React), Tailwind CSS, Framer Motion, Zustand, Tesseract.js, PDF.js, Konva
* **Backend:** FastAPI, Microsoft Presidio Analyzer, SpaCy
* **Language:** TypeScript (Frontend), Python (Backend)

### **Setup and Configuration Guide**

#### **Step 1: Backend (FastAPI)**
1. **Navigate to the API Directory:**
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
3. **Install Dependencies:**
   ```bash
   pip install fastapi uvicorn presidio-analyzer pydantic "spacy>=3.0.0,<4.0.0"
   python -m spacy download en_core_web_lg
   ```
4. **Run the API Server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   The backend will be available at `http://localhost:8000`.

#### **Step 2: Frontend (Next.js)**
1. **Navigate to the V2 Root Directory:**
   Open a new terminal window and run:
   ```bash
   cd CipheraV2
   ```
2. **Install Node Dependencies:**
   ```bash
   npm install
   ```
3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
4. **Access the App:**
   Open [http://localhost:3000](http://localhost:3000) in your browser. The frontend will automatically route requests to the FastAPI server.

---

## **Security & Privacy Note**

These tools are designed to assist with data anonymization. When handling real, sensitive data:
* **Audit Logs:** Ensure any generated logs linking original PII to anonymized values are stored securely.
* **Local Processing:** Keep your processing restricted to local instances or strictly isolated environments to maintain a Zero-Trust architecture when handling critical PII.