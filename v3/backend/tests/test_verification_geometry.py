import pytest
import fitz
import io
from app.schemas.document import RedactionEntity, BoundingBox
from app.services.verification_geometry import GeometryVerifier

def create_test_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(fitz.Point(50, 50), "Hello Secret123", fontsize=12)
    page.insert_text(fitz.Point(50, 100), "Safe Text Here", fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()

def redact_pdf(pdf_bytes: bytes, rect: fitz.Rect, fill=(0,0,0)) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    page.add_redact_annot(rect, fill=fill)
    page.apply_redactions()
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()

def test_geometry_verifier_clean_redaction():
    pdf_bytes = create_test_pdf()
    
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    rects = page.search_for("Secret123")
    target_rect = rects[0]
    doc.close()
    
    redacted_bytes = redact_pdf(pdf_bytes, target_rect)
    
    ent = RedactionEntity(
        id="123", entity_type="TEST", text="Secret123", score=1.0, page_num=1,
        bbox=BoundingBox(x0=target_rect.x0, y0=target_rect.y0, x1=target_rect.x1, y1=target_rect.y1),
        start_index=0, end_index=9, status="pending"
    )
    
    leaks = GeometryVerifier.verify(redacted_bytes, [ent])
    assert len(leaks) == 0

def test_geometry_verifier_undersized_redaction():
    pdf_bytes = create_test_pdf()
    
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    rects = page.search_for("Secret123")
    target_rect = rects[0]
    doc.close()
    
    # Redact only half of the width!
    half_rect = fitz.Rect(target_rect.x0, target_rect.y0, target_rect.x0 + target_rect.width/2, target_rect.y1)
    redacted_bytes = redact_pdf(pdf_bytes, half_rect)
    
    # But the Verification Engine expects the FULL rect!
    ent = RedactionEntity(
        id="123", entity_type="TEST", text="Secret123", score=1.0, page_num=1,
        bbox=BoundingBox(x0=target_rect.x0, y0=target_rect.y0, x1=target_rect.x1, y1=target_rect.y1),
        start_index=0, end_index=9, status="pending"
    )
    
    leaks = GeometryVerifier.verify(redacted_bytes, [ent])
    assert len(leaks) > 0
    assert "Geometry Leak" in leaks[0]

def test_geometry_verifier_ignores_unrelated_text():
    # If a redaction is very close to another word, apply_redactions will keep the other word.
    # GeometryVerifier shouldn't flag the adjacent word if it isn't in the rect.
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(fitz.Point(50, 50), "Safe Secret123", fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    pdf_bytes = out.getvalue()
    
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    rects = page.search_for("Secret123")
    target_rect = rects[0]
    doc.close()
    
    # Perfect redaction
    redacted_bytes = redact_pdf(pdf_bytes, target_rect)
    
    ent = RedactionEntity(
        id="123", entity_type="TEST", text="Secret123", score=1.0, page_num=1,
        bbox=BoundingBox(x0=target_rect.x0, y0=target_rect.y0, x1=target_rect.x1, y1=target_rect.y1),
        start_index=5, end_index=14, status="pending"
    )
    
    leaks = GeometryVerifier.verify(redacted_bytes, [ent])
    assert len(leaks) == 0

def test_no_redaction_document():
    # Primary engine missed everything!
    pdf_bytes = create_test_pdf()
    # GeometryVerifier requires expected entities, if empty it passes
    # (The Visual layer handles missing entities!)
    leaks = GeometryVerifier.verify(pdf_bytes, [])
    assert len(leaks) == 0
