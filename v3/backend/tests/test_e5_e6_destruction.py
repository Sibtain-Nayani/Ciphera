import io
import re
import pytest
import fitz
from app.services.document_parser import DocumentParser
from app.services.detection_engine import DetectionEngine
from app.services.decision_engine import DecisionEngine
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import VerificationEngine
from app.schemas.document import RedactionEntity, BoundingBox

def create_native_pdf(text_lines: list[str], rotation: int = 0) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    if rotation != 0:
        page.set_rotation(rotation)
    y = 100
    for line in text_lines:
        page.insert_text(fitz.Point(72, y), line, fontsize=12)
        y += 24
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()

def create_scanned_pdf_image(text_lines: list[str]) -> bytes:
    # Render native text to pixmap then create an image-only PDF
    native_bytes = create_native_pdf(text_lines)
    doc = fitz.open(stream=native_bytes, filetype="pdf")
    pix = doc[0].get_pixmap(dpi=150)
    img_bytes = pix.tobytes("png")
    doc.close()
    
    img_doc = fitz.open()
    rect = fitz.Rect(0, 0, pix.width * 72 / 150, pix.height * 72 / 150)
    page = img_doc.new_page(width=rect.width, height=rect.height)
    page.insert_image(rect, stream=img_bytes)
    out = io.BytesIO()
    img_doc.save(out)
    img_doc.close()
    return out.getvalue()

# ==========================================
# E5: Coordinate and Geometry Audits
# ==========================================

def test_geometry_padding_covers_descenders():
    """Verify redaction bounding box properly covers text with descenders (g, y, p, q, j)."""
    text = "Assessee: Sanjay Bajpayee, PAN: ABCPB1234F"
    pdf_bytes = create_native_pdf([text])
    
    canonical = DocumentParser.parse(pdf_bytes, "test.pdf")
    detected = DetectionEngine.run_detection(canonical)
    entities = DecisionEngine.apply_policies(detected, {"mode": "strict"})
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "test.pdf", entities)
    assert VerificationEngine.verify_redacted_file(redacted_bytes, "test.pdf", entities) is True
    
    # Audit residual text: neither PAN nor Name should exist
    doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    residual = doc[0].get_text("text")
    doc.close()
    assert "ABCPB1234F" not in residual
    assert "Bajpayee" not in residual

def test_geometry_multipage_and_rotation():
    """Verify coordinate mapping and redaction on rotated PDF pages (90 degrees)."""
    text_lines = [
        "CONFIDENTIAL MEDICAL RECORD",
        "Patient: Ananya Roy",
        "Aadhaar: 4532 8812 9901",
        "Mobile: 9876543210"
    ]
    pdf_bytes = create_native_pdf(text_lines, rotation=90)
    canonical = DocumentParser.parse(pdf_bytes, "test_rot.pdf")
    detected = DetectionEngine.run_detection(canonical)
    entities = DecisionEngine.apply_policies(detected, {"mode": "balanced"})
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "test_rot.pdf", entities)
    assert VerificationEngine.verify_redacted_file(redacted_bytes, "test_rot.pdf", entities) is True
    
    doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    residual = doc[0].get_text("text")
    doc.close()
    assert "4532 8812 9901" not in residual
    assert "9876543210" not in residual

# ==========================================
# E6: End-to-End Adversarial Destruction
# ==========================================

@pytest.mark.parametrize("pii_type,pii_text,pii_value", [
    ("PAN_NUMBER", "Income Tax Permanent Account Number: ABCDE1234F", "ABCDE1234F"),
    ("AADHAAR_NUMBER", "Government of India Aadhaar UID: 4532 8812 9901", "4532 8812 9901"),
    ("PHONE_NUMBER", "Primary Customer Contact Phone: 9876543210", "9876543210"),
    ("EMAIL_ADDRESS", "Authorized Contact Email: security.officer@enterprise.com", "security.officer@enterprise.com"),
    ("DATE_OF_BIRTH", "Applicant Date of Birth: 15/08/1985 recorded", "15/08/1985"),
    ("BANK_ACCOUNT", "Salary Credit Bank Account: 987654321012 confirmed", "987654321012"),
    ("IFSC_CODE", "Bank Branch Routing IFSC Code: HDFC0001234 verified", "HDFC0001234"),
])
def test_e2e_destruction_native_pdf(pii_type, pii_text, pii_value):
    """Destruction test: original PII cannot be extracted from final native PDF."""
    pdf_bytes = create_native_pdf([pii_text, "Public Document Footer"])
    canonical = DocumentParser.parse(pdf_bytes, f"test_{pii_type}.pdf")
    detected = DetectionEngine.run_detection(canonical)
    entities = DecisionEngine.apply_policies(detected, {"mode": "balanced"})
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, f"test_{pii_type}.pdf", entities)
    
    # 1. Independent Verification must pass
    assert VerificationEngine.verify_redacted_file(redacted_bytes, f"test_{pii_type}.pdf", entities) is True
    
    # 2. Native text stream extraction attempt must find 0 occurrences
    doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    final_text = doc[0].get_text("text")
    doc.close()
    assert pii_value not in final_text

def test_human_custom_bbox_destruction():
    """Verify manual user-specified custom bounding box is permanently destroyed."""
    pdf_bytes = create_native_pdf(["Top Secret Internal Key: SECRET_PROJECT_X"])
    
    # Manually defined bounding box by human reviewer
    custom_entity = RedactionEntity(
        id="manual_1",
        text="SECRET_PROJECT_X",
        entity_type="CUSTOM",
        score=1.0,
        page_num=1,
        bbox=BoundingBox(x0=70, y0=90, x1=400, y1=120),
        status="accepted"
    )
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "manual.pdf", [custom_entity])
    assert VerificationEngine.verify_redacted_file(redacted_bytes, "manual.pdf", [custom_entity]) is True
    
    doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    residual = doc[0].get_text("text")
    doc.close()
    assert "SECRET_PROJECT_X" not in residual
