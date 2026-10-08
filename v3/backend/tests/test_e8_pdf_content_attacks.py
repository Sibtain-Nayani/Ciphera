import pytest
import io
import fitz  # PyMuPDF
from PIL import Image

from app.services.document_parser import DocumentParser
from app.services.detection_engine import DetectionEngine
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import VerificationEngine


def test_white_text_on_white_background():
    """
    Vector 1: White text on white background (invisible text attack).
    Adversary hides PII by setting text font color to (1, 1, 1) on white canvas.
    Verification: DocumentParser extracts it, Detection finds it, Redaction wipes it,
    and Verification confirms 0 residual PII.
    """
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    
    # Insert invisible white text
    pii_text = "Taxpayer PAN: ABCDE1234F"
    page.insert_text(fitz.Point(100, 150), pii_text, fontsize=14, color=(1, 1, 1))
    
    pdf_bytes = doc.tobytes()
    doc.close()
    
    # 1. Parsing
    parsed = DocumentParser.parse(pdf_bytes, "invisible_white.pdf")
    assert "ABCDE1234F" in parsed.full_text
    
    # 2. Detection
    entities = DetectionEngine.run_detection(parsed)
    pan_entities = [e for e in entities if e.entity_type == "PAN_NUMBER"]
    assert len(pan_entities) >= 1
    assert "ABCDE1234F" in pan_entities[0].text
    
    # 3. Redaction
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "invisible_white.pdf", entities)
    
    # 4. Verification
    is_valid = VerificationEngine.verify_redacted_file(redacted_bytes, "invisible_white.pdf", entities)
    assert is_valid is True
    
    # Inspect raw text in redacted PDF
    redacted_doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    raw_text = redacted_doc[0].get_text()
    redacted_doc.close()
    assert "ABCDE1234F" not in raw_text


def test_text_hidden_behind_opaque_overlay():
    """
    Vector 2: Text hidden behind opaque vector overlay.
    Text is rendered and then completely obscured by a solid dark rectangle overlay.
    Verification: Parser still recovers stream text, detector tags it, redaction cleans the stream.
    """
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    
    pii_text = "Government Aadhaar: 4532 8812 9901"
    page.insert_text(fitz.Point(100, 200), pii_text, fontsize=14, color=(0, 0, 0))
    
    # Draw opaque overlay rectangle directly covering the text
    overlay_rect = fitz.Rect(95, 180, 400, 220)
    page.draw_rect(overlay_rect, color=(0.1, 0.2, 0.5), fill=(0.1, 0.2, 0.5))
    
    pdf_bytes = doc.tobytes()
    doc.close()
    
    # 1. Parsing & Detection
    parsed = DocumentParser.parse(pdf_bytes, "overlay_hidden.pdf")
    assert "4532 8812 9901" in parsed.full_text
    
    entities = DetectionEngine.run_detection(parsed)
    aadhaar_entities = [e for e in entities if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar_entities) >= 1
    
    # 2. Redaction & Verification
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "overlay_hidden.pdf", entities)
    is_valid = VerificationEngine.verify_redacted_file(redacted_bytes, "overlay_hidden.pdf", entities)
    assert is_valid is True
    
    redacted_doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    raw_text = redacted_doc[0].get_text()
    redacted_doc.close()
    assert "4532 8812 9901" not in raw_text


def test_hidden_ocr_layer_behind_raster_image():
    """
    Vector 3: Searchable PDF with hidden OCR text layer behind image.
    An image is rendered on the page, with an invisible OCR text layer positioned behind/over it.
    Verification: Both the OCR text stream is removed and the visual raster pixel area is blacked out.
    """
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    
    # Draw background image
    img = Image.new("RGB", (300, 100), color=(240, 240, 240))
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    page.insert_image(fitz.Rect(50, 50, 350, 150), stream=img_byte_arr.getvalue())
    
    # Insert text layer
    page.insert_text(fitz.Point(60, 100), "Direct Helpline Phone: 9876543210", fontsize=12)
    
    pdf_bytes = doc.tobytes()
    doc.close()
    
    parsed = DocumentParser.parse(pdf_bytes, "scanned_searchable.pdf")
    assert "9876543210" in parsed.full_text
    
    entities = DetectionEngine.run_detection(parsed)
    phone_entities = [e for e in entities if e.entity_type == "PHONE_NUMBER"]
    assert len(phone_entities) >= 1
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "scanned_searchable.pdf", entities)
    is_valid = VerificationEngine.verify_redacted_file(redacted_bytes, "scanned_searchable.pdf", entities)
    assert is_valid is True
    
    redacted_doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    assert "9876543210" not in redacted_doc[0].get_text()
    redacted_doc.close()


def test_metadata_scrubbing_purges_pii():
    """
    Vector 4: PII hidden inside PDF Document Metadata (Info dict & XMP).
    PDF metadata properties (Title, Author, Subject) often contain leaked PII.
    Verification: Redaction engine unconditionally scrubs document metadata.
    """
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text(fitz.Point(100, 100), "Normal Document Body", fontsize=12)
    
    # Inject PII into metadata fields
    doc.set_metadata({
        "title": "Confidential Report for Aadhaar 453288129901",
        "author": "taxpayer_ABCDE1234F@enterprise.com",
        "subject": "PAN ABCDE1234F Verification",
        "keywords": "9876543210"
    })
    
    pdf_bytes = doc.tobytes()
    doc.close()
    
    # Parse & redact
    parsed = DocumentParser.parse(pdf_bytes, "metadata_leak.pdf")
    entities = DetectionEngine.run_detection(parsed)
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "metadata_leak.pdf", entities)
    
    # Verify redacted metadata is scrubbed clean
    redacted_doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    meta = redacted_doc.metadata
    redacted_doc.close()
    
    assert meta.get("title") in [None, ""]
    assert meta.get("author") in [None, ""]
    assert meta.get("subject") in [None, ""]
    assert meta.get("keywords") in [None, ""]
    assert "ABCDE1234F" not in str(meta)
    assert "453288129901" not in str(meta)
    assert "9876543210" not in str(meta)


def test_embedded_attachment_streams_purged():
    """
    Vector 5: PII hidden inside PDF Embedded File Attachments.
    PDF allows arbitrary binary and text attachments to be embedded in the file.
    Verification: Redaction engine removes embedded attachments to avoid hidden leak vectors.
    """
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text(fitz.Point(100, 100), "Main Document Content", fontsize=12)
    
    # Embed an attachment containing PII
    attachment_data = b"Secret PAN: ABCDE1234F and Aadhaar 453288129901"
    doc.embfile_add("secret_data.txt", attachment_data, filename="secret_data.txt")
    assert doc.embfile_count() == 1
    
    pdf_bytes = doc.tobytes()
    doc.close()
    
    parsed = DocumentParser.parse(pdf_bytes, "attachment_leak.pdf")
    entities = DetectionEngine.run_detection(parsed)
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "attachment_leak.pdf", entities)
    
    redacted_doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    assert redacted_doc.embfile_count() == 0
    redacted_doc.close()


def test_extreme_coordinate_boundary_text():
    """
    Vector 6: Text near extreme page coordinate boundaries.
    Ensures that text at page edges is correctly handled without clipping math errors or index crashes.
    """
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    
    # Text right at the bottom edge
    page.insert_text(fitz.Point(50, 780), "Primary Customer Contact Phone: 9876543210", fontsize=10)
    
    pdf_bytes = doc.tobytes()
    doc.close()
    
    parsed = DocumentParser.parse(pdf_bytes, "boundary_test.pdf")
    assert "9876543210" in parsed.full_text
    
    entities = DetectionEngine.run_detection(parsed)
    assert len(entities) >= 1
    
    redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "boundary_test.pdf", entities)
    is_valid = VerificationEngine.verify_redacted_file(redacted_bytes, "boundary_test.pdf", entities)
    assert is_valid is True
