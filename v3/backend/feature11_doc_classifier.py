"""
Ciphera V3 — Feature 11: Auto Document Type Classifier
=======================================================
Analyzes document content (not just filename) to detect document type.
Returns a confidence-scored classification used to auto-apply templates.

Types: kyc, invoice, resume, medical, legal, financial, hr, unknown

Endpoint: POST /api/v3/classify
Place at: v3/backend/feature11_doc_classifier.py
"""

from __future__ import annotations
import re
import logging
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("ciphera.classifier")
router = APIRouter()


# ── Keyword signals per document type ────────────────────────────────────────

SIGNALS: dict[str, list[str]] = {
    "kyc": [
        "aadhaar", "aadhar", "pan card", "kyc", "know your customer",
        "date of birth", "dob", "father's name", "mother's name",
        "permanent address", "identity proof", "address proof",
        "voter id", "passport number", "driving licence",
    ],
    "invoice": [
        "invoice", "bill to", "ship to", "gst", "gstin", "tax invoice",
        "total amount", "subtotal", "payment due", "invoice number",
        "purchase order", "vendor", "buyer", "seller", "igst", "cgst", "sgst",
        "amount payable", "due date", "invoice date",
    ],
    "resume": [
        "curriculum vitae", "resume", "objective", "work experience",
        "education", "skills", "projects", "internship", "cgpa", "gpa",
        "references", "hobbies", "certifications", "linkedin", "github",
        "summary", "profile", "achievements", "publications",
    ],
    "medical": [
        "patient", "diagnosis", "prescription", "dosage", "medicine",
        "doctor", "physician", "hospital", "clinic", "blood group",
        "allergies", "symptoms", "treatment", "discharge summary",
        "lab report", "radiology", "pathology", "icd", "mg", "tablet",
    ],
    "legal": [
        "agreement", "contract", "whereas", "hereinafter", "party",
        "plaintiff", "defendant", "jurisdiction", "arbitration",
        "governing law", "indemnity", "liability", "breach", "clause",
        "terms and conditions", "witness", "notary", "affidavit",
        "memorandum", "deed", "conveyance",
    ],
    "financial": [
        "account statement", "bank statement", "balance", "credit",
        "debit", "transaction", "ifsc", "account number", "statement period",
        "opening balance", "closing balance", "mutual fund", "portfolio",
        "nav", "units", "folio", "cas", "consolidated account statement",
    ],
    "hr": [
        "offer letter", "employment", "salary", "ctc", "joining date",
        "designation", "department", "reporting manager", "probation",
        "appraisal", "increment", "performance", "leave policy",
        "notice period", "relieving letter", "experience letter",
    ],
}

# Weights for exact phrase vs keyword match
EXACT_WEIGHT   = 3
KEYWORD_WEIGHT = 1


class ClassifyRequest(BaseModel):
    text:          str
    filename:      str = ""
    max_chars:     int = 2000   # only analyze first N chars for speed


class ClassifyResponse(BaseModel):
    document_type: str
    confidence:    float          # 0.0–1.0
    scores:        dict[str, float]
    auto_template: str            # recommended template ID


DOC_TO_TEMPLATE = {
    "kyc":       "builtin_kyc",
    "invoice":   "builtin_financial",
    "resume":    "builtin_hr",
    "medical":   "builtin_medical",
    "legal":     "builtin_legal",
    "financial": "builtin_financial",
    "hr":        "builtin_hr",
    "unknown":   "",
}


def classify_content(text: str, filename: str = "") -> ClassifyResponse:
    sample  = text[:2000].lower()
    fname   = filename.lower()
    scores: dict[str, float] = {}

    for doc_type, keywords in SIGNALS.items():
        score = 0.0
        for kw in keywords:
            if kw in sample:
                # Exact phrase in text
                score += EXACT_WEIGHT if ' ' in kw else KEYWORD_WEIGHT
        # Filename bonus
        if any(kw in fname for kw in keywords[:5]):
            score += 2.0
        scores[doc_type] = round(score, 2)

    if not any(scores.values()):
        return ClassifyResponse(
            document_type="unknown", confidence=0.0,
            scores=scores, auto_template="",
        )

    best_type  = max(scores, key=lambda k: scores[k])
    best_score = scores[best_type]
    total      = sum(scores.values()) or 1
    confidence = round(min(best_score / total * 2, 1.0), 3)

    # Require minimum score to commit to a type
    if best_score < 3:
        best_type  = "unknown"
        confidence = 0.0

    return ClassifyResponse(
        document_type=best_type,
        confidence=confidence,
        scores=scores,
        auto_template=DOC_TO_TEMPLATE.get(best_type, ""),
    )


@router.post("/api/v3/classify", response_model=ClassifyResponse)
async def classify_document(request: ClassifyRequest):
    result = classify_content(request.text, request.filename)
    logger.info(
        "Classified '%s' as '%s' (confidence=%.2f)",
        request.filename, result.document_type, result.confidence,
    )
    return result
