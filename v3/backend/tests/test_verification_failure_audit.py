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
    # Insert text
    page.insert_text(fitz.Point(50, 50), text, fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()

def run_full_pipeline_audit(text: str) -> dict:
    pdf_bytes = create_test_pdf(text)
    
    # 1. Parse
    canonical_doc = DocumentParser.parse(pdf_bytes, "test.pdf")
    
    # 2. Detect (Primary Engine)
    detected_entities = DetectionEngine.run_detection(canonical_doc)
    
    # 3. Redact
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "test.pdf", detected_entities)
    
    # 4. Verify
    verification_passed = True
    verification_error = None
    try:
        VerificationEngine.verify_redacted_file(redacted_bytes, "redacted_test.pdf", detected_entities)
    except HTTPException as e:
        verification_passed = False
        verification_error = e.detail

    # 5. Extract residual text for analysis
    residual_doc = DocumentParser.parse(redacted_bytes, "redacted_test.pdf")
    
    return {
        "text": text,
        "detected_count": len(detected_entities),
        "verification_passed": verification_passed,
        "verification_error": verification_error,
        "residual_text": residual_doc.full_text.strip()
    }

def test_baseline_clean_redaction():
    """Verify that a normal detected entity is redacted and passes verification."""
    res = run_full_pipeline_audit("My PAN is ABCPQ1234Z for taxes.")
    assert res["detected_count"] >= 1
    # Residual text shouldn't contain the PAN
    assert "ABCPQ1234Z" not in res["residual_text"]
    assert res["verification_passed"] is True

def test_ocr_fuzzy_blind_spot():
    """
    Test an OCR-fuzzed PAN that the Primary Engine might miss,
    but we want to see if the VerificationEngine catches it!
    """
    # Primary engine misses I3CDEI234O because '3' is not in the normalization map
    res = run_full_pipeline_audit("My PAN is I3CDEI234O.")
    
    # 1. Primary misses it
    assert res["detected_count"] == 0
    
    # 2. Because it's missed, it's NOT redacted.
    assert "I3CDEI234O" in res["residual_text"]
    
    # 3. Does verification catch it?
    # Verification regex is \\b[A-Z]{5}[0-9]{4}[A-Z]\\b. This will NOT match I3CDEI234O!
    # Expected: Verification FAILS to catch the leak, meaning it passes!
    assert res["verification_passed"] is True, "Verification incorrectly thinks document is clean because it shares the same blind spot!"

def test_spatial_fragmentation_blind_spot():
    """
    Test highly fragmented text.
    Primary engine defragments, but only for certain lengths.
    Let's use a very widely spaced PAN.
    """
    res = run_full_pipeline_audit("P A N : A B C D E 1 2 3 4 F")
    
    # 1. Primary misses it (doc_009_defrag_stress proved this)
    assert res["detected_count"] == 0
    
    # 2. Not redacted.
    assert "A B C D E 1 2 3 4 F" in res["residual_text"]
    
    # 3. Verification uses \\b[A-Z]{5}[0-9]{4}[A-Z]\\b which requires NO spaces!
    # Verification will definitely miss it.
    assert res["verification_passed"] is True, "Verification blind to fragmentation!"

def test_context_gating_blind_spot():
    """
    Primary engine requires context for 10-digit numbers.
    If context is missing, it drops it.
    Does verification catch it?
    """
    # 10 digits with NO context keywords (e.g. no "Phone", "Mobile")
    res = run_full_pipeline_audit("The ID is 9988776655.")
    
    # Primary misses due to strict context gating
    assert res["detected_count"] == 0
    
    # Verification uses \\b(?:\\+?91[-. ]?)?[6789]\\d{9}\\b which has NO context gating!
    # Meaning Verification WILL catch it and raise an error!
    assert res["verification_passed"] is False
    assert "PHONE_GENERIC" in res["verification_error"]

def test_whitelist_does_not_hide_unrelated_pii():
    """
    If we whitelist an entity, does it hide other PII?
    """
    pdf_bytes = create_test_pdf("Contact 9876543210 and PAN ABCPQ1234Z.")
    canonical = DocumentParser.parse(pdf_bytes, "test.pdf")
    detected = DetectionEngine.run_detection(canonical)
    
    # Artificial manipulation: Keep Phone whitelisted, but delete PAN so it leaks
    pan_removed = [d for d in detected if d.entity_type == "PHONE_NUMBER"]
    for d in pan_removed:
        d.status = "rejected" # Whitelist phone
        
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "test.pdf", pan_removed)
    
    # Now PAN is leaked. Phone is whitelisted.
    try:
        VerificationEngine.verify_redacted_file(redacted_bytes, "test.pdf", pan_removed)
        passed = True
    except HTTPException as e:
        passed = False
        assert "PAN_CARD" in e.detail
        assert "PHONE_GENERIC" not in e.detail # Phone is allowed
        
    assert passed is False, "Verification should fail on PAN leak despite phone whitelist"
