import pytest
import fitz
import io
import re

from app.schemas.document import CanonicalDocument, RedactionEntity, BoundingBox
from app.services.document_parser import DocumentParser
from app.services.detection_engine import DetectionEngine
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import VerificationEngine
from fastapi import HTTPException

def create_test_pdf(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(fitz.Point(50, 50), text, fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()

def run_full_pipeline_audit(text: str) -> dict:
    pdf_bytes = create_test_pdf(text)
    
    canonical_doc = DocumentParser.parse(pdf_bytes, "test.pdf")
    detected_entities = DetectionEngine.run_detection(canonical_doc)
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "test.pdf", detected_entities)
    
    verification_passed = True
    verification_error = None
    try:
        VerificationEngine.verify_redacted_file(redacted_bytes, "redacted_test.pdf", detected_entities)
    except HTTPException as e:
        verification_passed = False
        verification_error = e.detail

    residual_doc = DocumentParser.parse(redacted_bytes, "redacted_test.pdf")
    
    return {
        "text": text,
        "detected_count": len(detected_entities),
        "verification_passed": verification_passed,
        "verification_error": verification_error,
        "residual_text": residual_doc.full_text.strip()
    }

def test_baseline_clean_redaction():
    res = run_full_pipeline_audit("My PAN is ABCDE1234F for taxes.")
    assert res["detected_count"] >= 1
    assert "ABCDE1234F" not in res["residual_text"]
    assert res["verification_passed"] is True

def test_ocr_fuzzy_blind_spot():
    res = run_full_pipeline_audit("My PAN is I3CDEI234O.")
    assert res["detected_count"] == 0
    assert "I3CDEI234O" in res["residual_text"]
    assert res["verification_passed"] is False
    assert "Visual Leak" in res["verification_error"] or "Defrag Leak" in res["verification_error"] or "PAN" in res["verification_error"]

def test_spatial_fragmentation_blind_spot():
    res = run_full_pipeline_audit("P A N : A B C D E 1 2 3 4 F")
    assert res["detected_count"] == 0
    assert "A B C D E 1 2 3 4 F" in res["residual_text"]
    assert res["verification_passed"] is False
    assert "Visual Leak" in res["verification_error"] or "Defrag Leak" in res["verification_error"]

def test_context_gating_blind_spot():
    res = run_full_pipeline_audit("The ID is 9988776655.")
    assert res["detected_count"] == 0
    assert res["verification_passed"] is False
    assert "PHONE_GENERIC" in res["verification_error"] or "Visual Leak" in res["verification_error"]

def test_whitelist_does_not_hide_unrelated_pii():
    pdf_bytes = create_test_pdf("Contact 9876543210 and PAN ABCPQ1234Z.")
    canonical = DocumentParser.parse(pdf_bytes, "test.pdf")
    detected = DetectionEngine.run_detection(canonical)
    
    pan_removed = [d for d in detected if d.entity_type == "PHONE_NUMBER"]
    for d in pan_removed:
        d.status = "rejected"
        
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "test.pdf", pan_removed)
    
    try:
        VerificationEngine.verify_redacted_file(redacted_bytes, "test.pdf", pan_removed)
        passed = True
    except HTTPException as e:
        passed = False
        assert "PAN" in e.detail
        
    assert passed is False
