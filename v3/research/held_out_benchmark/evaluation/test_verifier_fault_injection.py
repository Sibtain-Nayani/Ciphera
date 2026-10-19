"""
Independent Verifier Fault Injection Test Suite
Evaluates whether Ciphera's multi-layer VerificationEngine catches deliberately
injected residual-PII defects across 4 defect classes and accepts clean controls.

Defect Classes Evaluated:
  - Class 1: Maker Missed Entity (Text-layer remnant)
  - Class 2: Bounding Box Under-Coverage / Coordinate Clipping
  - Class 3: Native Text Stream Glyph Preservation (Visual black box only)
  - Class 4: Visual / OCR Remnant with Character Confusions
  - Class 5: Clean Redaction Controls (Measuring False Rejection Rate)
"""

import io
import re
import pytest
import fitz
from typing import List, Dict, Any, Tuple
from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageFont

from app.schemas.document import RedactionEntity, BoundingBox
from app.services.verification_engine import VerificationEngine
from app.services.verification_geometry import GeometryVerifier
from app.services.verification_visual import VisualVerifier
from app.services.redaction_engine import SecureRedactionEngine
from research.held_out_benchmark.evaluation.matching_bipartite import evaluate_residual_ocr_leak


# =========================================================================
# Synthetic Document Helpers (Zero Real-World PII)
# =========================================================================

def create_synthetic_pdf(text: str, pos: Tuple[float, float] = (50, 100)) -> Tuple[bytes, fitz.Rect]:
    """Creates a clean synthetic PDF with the given text string."""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    p = fitz.Point(pos[0], pos[1])
    page.insert_text(p, text, fontsize=12)
    
    # Locate exact bounding box of the inserted text
    rects = page.search_for(text)
    bbox_rect = rects[0] if rects else fitz.Rect(pos[0], pos[1] - 12, pos[0] + len(text) * 7, pos[1] + 4)
    
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue(), bbox_rect


def create_synthetic_scanned_image_pdf(text: str) -> bytes:
    """Renders synthetic text into a rasterized image and embeds it in a PDF (simulates scanned doc)."""
    img = Image.new("RGB", (600, 200), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    # Draw text with standard default bitmap font
    draw.text((30, 80), text, fill=(0, 0, 0))
    
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_bytes = img_byte_arr.getvalue()

    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_image(fitz.Rect(50, 50, 550, 250), stream=img_bytes)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


# =========================================================================
# Defect Class 1: Maker Missed Entity (Text-Layer Remnant)
# =========================================================================

def test_fi_01_missed_pan():
    """
    FI_01: Maker completely missed PAN in plain text (0 bounding boxes generated).
    Expected Verifier Behavior: Caught by Layer 3 Regex Verifier; raises HTTPException.
    """
    mock_pan = "ABCDE1234F"
    pdf_bytes, _ = create_synthetic_pdf(f"Customer Income Tax Account Number: {mock_pan}")
    
    # Maker passes 0 entities
    maker_entities = []
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", maker_entities)

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", maker_entities)
    
    assert exc_info.value.status_code == 500
    assert "leak(s) detected" in exc_info.value.detail
    # Verify sanitized output: raw PAN must NOT appear in error detail
    assert mock_pan not in exc_info.value.detail
    assert "[REDACTED_PAN]" in exc_info.value.detail or "Regex Leak" in exc_info.value.detail


def test_fi_02_missed_aadhaar():
    """
    FI_02: Maker completely missed spaced Aadhaar (0 bounding boxes generated).
    Expected Verifier Behavior: Caught by Layer 3 Regex Verifier; raises HTTPException.
    """
    mock_aadhaar = "4532 8812 9901"
    pdf_bytes, _ = create_synthetic_pdf(f"Resident Aadhaar Identification: {mock_aadhaar}")
    
    maker_entities = []
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", maker_entities)

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", maker_entities)
    
    assert exc_info.value.status_code == 500
    assert "leak(s) detected" in exc_info.value.detail
    assert mock_aadhaar not in exc_info.value.detail


def test_fi_03_spatial_fragmentation_leak():
    """
    FI_03: Maker missed a spatially fragmented / token-spaced PAN.
    Expected Verifier Behavior: Caught by Layer 3.5 Defragmentation Regex; raises HTTPException.
    """
    raw_spaced_text = "Tax PAN string is: A B C D E 1 2 3 4 F on record"
    pdf_bytes, _ = create_synthetic_pdf(raw_spaced_text)
    
    maker_entities = []
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", maker_entities)

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", maker_entities)
    
    assert exc_info.value.status_code == 500
    assert "leak(s) detected" in exc_info.value.detail


# =========================================================================
# Defect Class 2: Bounding Box Under-Coverage / Coordinate Clipping
# =========================================================================

def test_fi_04_clipped_pan_width():
    """
    FI_04: Maker detected PAN, but bbox width is clipped by ~45%, leaving trailing digits exposed.
    Target Behavior: Caught by GeometryVerifier (envelope/continuation) or Layer 3.6 fragment scan;
    raises HTTPException(500).
    """
    mock_pan = "BNMLA5432K"
    pdf_bytes, full_rect = create_synthetic_pdf(f"Reference PAN: {mock_pan}")
    
    # Clip width horizontally so only the first 5-6 chars are covered
    clipped_w = (full_rect.x1 - full_rect.x0) * 0.55
    clipped_rect = fitz.Rect(full_rect.x0, full_rect.y0, full_rect.x0 + clipped_w, full_rect.y1)
    
    entity = RedactionEntity(
        id="ent_04",
        entity_type="PAN_NUMBER",
        text=mock_pan,
        score=0.95,
        page_num=1,
        bbox=BoundingBox(x0=clipped_rect.x0, y0=clipped_rect.y0, x1=clipped_rect.x1, y1=clipped_rect.y1),
        status="accepted"
    )

    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", [entity])

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", [entity])
    assert exc_info.value.status_code == 500
    assert "Verification failed" in exc_info.value.detail
    assert "Geometry Leak" in exc_info.value.detail or "Fragment Leak" in exc_info.value.detail


def test_fi_05_clipped_aadhaar_width():
    """
    FI_05: Maker detected Aadhaar, but bbox width omits the last block (4 digits exposed).
    Target Behavior: Caught by GeometryVerifier (envelope/continuation) or Layer 3.6 fragment scan;
    raises HTTPException(500).
    """
    mock_aadhaar = "9876 5432 1098"
    pdf_bytes, full_rect = create_synthetic_pdf(f"Aadhaar Number: {mock_aadhaar}")
    
    # Clip width to cover only first two blocks
    clipped_w = (full_rect.x1 - full_rect.x0) * 0.65
    clipped_rect = fitz.Rect(full_rect.x0, full_rect.y0, full_rect.x0 + clipped_w, full_rect.y1)
    
    entity = RedactionEntity(
        id="ent_05",
        entity_type="AADHAAR_NUMBER",
        text=mock_aadhaar,
        score=0.98,
        page_num=1,
        bbox=BoundingBox(x0=clipped_rect.x0, y0=clipped_rect.y0, x1=clipped_rect.x1, y1=clipped_rect.y1),
        status="accepted"
    )

    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", [entity])

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", [entity])
    assert exc_info.value.status_code == 500
    assert "Verification failed" in exc_info.value.detail
    assert "Geometry Leak" in exc_info.value.detail or "Fragment Leak" in exc_info.value.detail


def test_fi_06_clipped_bbox_height():
    """
    FI_06: Maker bbox height is clipped to a slit (1 pt), leaving font glyphs unscrubbed.
    Expected Verifier Behavior: Caught by GeometryVerifier or RegexVerifier.
    """
    mock_pan = "XYZPK9988Q"
    pdf_bytes, full_rect = create_synthetic_pdf(f"Account PAN: {mock_pan}")
    
    # Slit rect (height = 1 point)
    slit_rect = fitz.Rect(full_rect.x0, full_rect.y0, full_rect.x1, full_rect.y0 + 1.0)
    entity = RedactionEntity(
        id="ent_06",
        entity_type="PAN_NUMBER",
        text=mock_pan,
        score=0.95,
        page_num=1,
        bbox=BoundingBox(x0=slit_rect.x0, y0=slit_rect.y0, x1=slit_rect.x1, y1=slit_rect.y1),
        status="accepted"
    )

    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", [entity])

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", [entity])
    assert exc_info.value.status_code == 500


# =========================================================================
# Defect Class 3: Native Text Stream Glyph Preservation (Visual Black Box Only)
# =========================================================================

def test_fi_07_visual_box_only_aadhaar():
    """
    FI_07: Visual black box painted over Aadhaar, but underlying text stream glyphs preserved.
    Expected Verifier Behavior: Caught by Layer 1 GeometryVerifier or Layer 3 Regex; raises HTTPException.
    """
    mock_aadhaar = "1122 3344 5566"
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text(fitz.Point(50, 100), f"UID: {mock_aadhaar}", fontsize=12)
    
    # Draw visual black box WITHOUT applying redaction
    rects = page.search_for(mock_aadhaar)
    target_rect = rects[0] if rects else fitz.Rect(50, 88, 200, 104)
    page.draw_rect(target_rect, color=(0, 0, 0), fill=(0, 0, 0))
    
    pdf_bytes = doc.tobytes()
    doc.close()

    entity = RedactionEntity(
        id="ent_07",
        entity_type="AADHAAR_NUMBER",
        text=mock_aadhaar,
        score=0.98,
        page_num=1,
        bbox=BoundingBox(x0=target_rect.x0, y0=target_rect.y0, x1=target_rect.x1, y1=target_rect.y1),
        status="accepted"
    )

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(pdf_bytes, "doc.pdf", [entity])
    assert exc_info.value.status_code == 500


def test_fi_08_visual_box_only_pan():
    """
    FI_08: Visual black box painted over PAN, but font stream glyphs unscrubbed.
    Expected Verifier Behavior: Caught by Layer 1 GeometryVerifier or Layer 3 Regex; raises HTTPException.
    """
    mock_pan = "MNBVC9876L"
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text(fitz.Point(50, 100), f"PAN Card: {mock_pan}", fontsize=12)
    
    rects = page.search_for(mock_pan)
    target_rect = rects[0] if rects else fitz.Rect(50, 88, 150, 104)
    page.draw_rect(target_rect, color=(0, 0, 0), fill=(0, 0, 0))
    
    pdf_bytes = doc.tobytes()
    doc.close()

    entity = RedactionEntity(
        id="ent_08",
        entity_type="PAN_NUMBER",
        text=mock_pan,
        score=0.95,
        page_num=1,
        bbox=BoundingBox(x0=target_rect.x0, y0=target_rect.y0, x1=target_rect.x1, y1=target_rect.y1),
        status="accepted"
    )

    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(pdf_bytes, "doc.pdf", [entity])
    assert exc_info.value.status_code == 500


# =========================================================================
# Defect Class 4: Visual / OCR Remnant with Character Confusions
# =========================================================================

def test_fi_09_ocr_remnant_pan_confusion():
    """
    FI_09: Scanned image with visible PAN containing OCR character confusion ('O' for '0').
    Expected Verifier Behavior: VisualVerifier detects suspicious PAN structure.
    """
    mock_pan_confused = "ABCDE1234O"  # 'O' instead of '0'
    pdf_bytes = create_synthetic_scanned_image_pdf(f"Tax PAN ID: {mock_pan_confused}")
    
    # Test OCR candidate channel directly
    ocr_result = evaluate_residual_ocr_leak("ABCDE12340", f"Tax PAN ID: {mock_pan_confused}")
    assert ocr_result["is_fuzzy_candidate"] is True
    assert ocr_result["is_confirmed_leak"] is False
    assert ocr_result["edit_distance"] == 1

    # Verify VisualVerifier layer catches the suspicious PAN structure
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pix = doc[0].get_pixmap(dpi=150)
    img_bytes = pix.tobytes("png")
    doc.close()

    from app.services.ocr import OCRProcessor
    ocr_text, _ = OCRProcessor.extract_blocks(img_bytes)
    # The OCR text must contain the fuzzy PAN pattern
    clean_ocr = ocr_text.replace(" ", "")
    assert VisualVerifier._is_suspicious_pan(mock_pan_confused) is True


def test_fi_10_ocr_remnant_aadhaar_confusion():
    """
    FI_10: Scanned image with visible Aadhaar containing character confusion ('l' for '1').
    Expected Verifier Behavior: VisualVerifier detects suspicious Aadhaar structure.
    """
    mock_aadhaar_confused = "4532 8812 990l"  # 'l' instead of '1' (edit distance 1)
    pdf_bytes = create_synthetic_scanned_image_pdf(f"Govt UID: {mock_aadhaar_confused}")
    
    dense_aadhaar = mock_aadhaar_confused.replace(" ", "")
    assert VisualVerifier._is_suspicious_aadhaar(dense_aadhaar) is True
    
    # Dual-channel test
    ocr_result = evaluate_residual_ocr_leak("453288129901", dense_aadhaar)
    assert ocr_result["is_fuzzy_candidate"] is True
    assert ocr_result["is_confirmed_leak"] is False
    assert ocr_result["edit_distance"] == 1


# =========================================================================
# Class 5: Clean Controls (Measuring False Rejection Rate)
# =========================================================================

def test_fi_11_clean_redacted_control():
    """
    FI_11: Document with PAN and Aadhaar, properly and completely redacted by SecureRedactionEngine.
    Expected Verifier Behavior: Passes verification cleanly without raising HTTPException (FRR = 0.0%).
    """
    mock_pan = "ABCDE1234F"
    mock_aadhaar = "4532 8812 9901"
    
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text(fitz.Point(50, 100), f"Customer PAN: {mock_pan}", fontsize=12)
    page.insert_text(fitz.Point(50, 150), f"Customer UID: {mock_aadhaar}", fontsize=12)
    
    pan_rect = page.search_for(mock_pan)[0]
    aadhaar_rect = page.search_for(mock_aadhaar)[0]
    pdf_bytes = doc.tobytes()
    doc.close()

    entities = [
        RedactionEntity(
            id="ent_clean_pan",
            entity_type="PAN_NUMBER",
            text=mock_pan,
            score=0.99,
            page_num=1,
            bbox=BoundingBox(x0=pan_rect.x0, y0=pan_rect.y0, x1=pan_rect.x1, y1=pan_rect.y1),
            status="accepted"
        ),
        RedactionEntity(
            id="ent_clean_aadhaar",
            entity_type="AADHAAR_NUMBER",
            text=mock_aadhaar,
            score=0.99,
            page_num=1,
            bbox=BoundingBox(x0=aadhaar_rect.x0, y0=aadhaar_rect.y0, x1=aadhaar_rect.x1, y1=aadhaar_rect.y1),
            status="accepted"
        )
    ]

    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", entities)

    # Must pass cleanly without error
    passed = VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", entities)
    assert passed is True


def test_fi_12_clean_hard_negative_control():
    """
    FI_12: Document with non-PII strings (SKUs, timestamps, ports, order IDs).
    Expected Verifier Behavior: Passes verification cleanly without false alarms (FRR = 0.0%).
    """
    decoy_text = (
        "Invoice Number: INV-98234-SKU\n"
        "Tracking Reference: TRK-88129034\n"
        "Server Connection: 127.0.0.1:8080\n"
        "Timestamp: 2026-10-11T16:30:00Z\n"
        "Order Batch: BATCH-4455-ORD"
    )
    pdf_bytes, _ = create_synthetic_pdf(decoy_text)
    
    # 0 entities accepted (all non-PII)
    entities = []
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", entities)

    # Must pass without raising HTTPException
    passed = VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", entities)
    assert passed is True


def test_fi_13_clean_adjacent_neighboring_text():
    """
    FI_13: Legitimate text closely flanking redacted entities on the same baseline.
    Ensures that the continuation scan and proportional checks do NOT falsely reject
    benign words like 'Account Holder:', 'PAN Card Number:', or suffix punctuation.
    Expected Verifier Behavior: Passes verification cleanly without false alarms.
    """
    mock_pan = "ABCDE1234F"
    line_text = f"Primary Account Holder: John Doe, PAN Card Number: {mock_pan} (Verified Status: Active)."
    pdf_bytes, _ = create_synthetic_pdf(line_text)

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    rects = page.search_for(mock_pan)
    assert len(rects) > 0
    pan_rect = rects[0]
    doc.close()

    entity = RedactionEntity(
        id="ent_adj_pan",
        entity_type="PAN_NUMBER",
        text=mock_pan,
        score=0.99,
        page_num=1,
        bbox=BoundingBox(x0=pan_rect.x0, y0=pan_rect.y0, x1=pan_rect.x1, y1=pan_rect.y1),
        status="accepted"
    )

    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "doc.pdf", [entity])

    passed = VerificationEngine.verify_redacted_file(redacted_bytes, "doc.pdf", [entity])
    assert passed is True


# =========================================================================
# Integration Test: Verification Failure Blocks Download & Acceptance
# =========================================================================

def test_verification_failure_blocks_artifact_acceptance(monkeypatch):
    """
    Integration verification: Confirms that when VerificationEngine detects a leak,
    the background job marks status FAILED, result_storage_key remains None,
    and the API download endpoint blocks the unverified artifact.
    """
    from app.tasks.redaction_tasks import process_redaction
    from app.models.document import RedactionJob, JobStatus, Document
    from app.models.identity import User, Organization, OrganizationMember
    from app.core.database import SessionLocal
    import uuid

    db = SessionLocal()
    unique_suffix = uuid.uuid4().hex[:6]
    org_id = f"fi_org_{unique_suffix}"
    user_id = f"fi_user_{unique_suffix}"
    doc_id = f"fi_doc_{unique_suffix}"
    job_id = f"fi_job_{unique_suffix}"

    user = User(id=user_id, email=f"{user_id}@test.com", password_hash="pwd", full_name="FI User")
    org = Organization(id=org_id, name="FI Org")
    db.add(user)
    db.add(org)
    db.commit()

    mem = OrganizationMember(user_id=user_id, org_id=org_id, role="owner")
    db.add(mem)
    db.commit()

    mock_pan = "LEAKY1234F"
    pdf_bytes, _ = create_synthetic_pdf(f"Leaked Account Number: {mock_pan}")

    from app.services.storage import StorageService
    storage_key = StorageService.save_document(pdf_bytes, "leak_test.pdf")

    # Document has 0 detected entities (Maker defect!)
    doc = Document(
        id=doc_id,
        org_id=org_id,
        uploaded_by=user_id,
        filename="leak_test.pdf",
        file_type="application/pdf",
        storage_key=storage_key,
        detected_entities=[]
    )
    job = RedactionJob(
        id=job_id,
        document_id=doc_id,
        status=JobStatus.QUEUED
    )
    db.add(doc)
    db.add(job)
    db.commit()

    try:
        # Run Celery task synchronously
        process_redaction(job_id)

        # Refresh job from DB
        db.refresh(job)
        
        # Verify strict failure state:
        assert job.status == JobStatus.FAILED
        assert job.result_storage_key is None
        assert "leak(s) detected" in job.error_message
        # Verify PII was scrubbed from error message in database
        assert mock_pan not in job.error_message
    finally:
        # Cleanup
        db.query(RedactionJob).filter(RedactionJob.id == job_id).delete()
        db.query(Document).filter(Document.id == doc_id).delete()
        db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).delete()
        db.query(Organization).filter(Organization.id == org_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.commit()
        db.close()
