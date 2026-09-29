import pytest
from fastapi import HTTPException
from app.services.verification_engine import VerificationEngine
from app.schemas.document import CanonicalDocument, RedactionEntity
import fitz
import io

@pytest.fixture
def mock_document_parser(monkeypatch):
    class MockParser:
        return_value = None
        @classmethod
        def parse(cls, *args, **kwargs):
            return cls.return_value
    
    monkeypatch.setattr('app.services.document_parser.DocumentParser.parse', MockParser.parse)
    return MockParser

def test_independent_verification_success(mock_document_parser):
    clean_text = "This is a clean document. The PAN was redacted, leaving just blank space."
    
    mock_doc = CanonicalDocument(
        metadata={"filename": "test.pdf"},
        blocks=[],
        full_text=clean_text,
        page_count=1
    )
    mock_document_parser.return_value = mock_doc
    
    doc = fitz.open()
    doc.new_page().insert_text(fitz.Point(50,50), "clean")
    out = io.BytesIO()
    doc.save(out)
    
    result = VerificationEngine.verify_redacted_file(out.getvalue(), 'test.pdf')
    assert result is True

def test_independent_verification_catches_leaked_pan(mock_document_parser):
    # Use a PAN with 'P' as 4th char
    leaky_text = "Here is a missed PAN card: ABCPQ1234Z hidden in the text."
    
    mock_doc = CanonicalDocument(
        metadata={"filename": "test.pdf"},
        blocks=[],
        full_text=leaky_text,
        page_count=1
    )
    mock_document_parser.return_value = mock_doc

    doc = fitz.open()
    doc.new_page().insert_text(fitz.Point(50,50), leaky_text)
    out = io.BytesIO()
    doc.save(out)
    
    with pytest.raises(HTTPException) as exc:
        VerificationEngine.verify_redacted_file(out.getvalue(), 'test.pdf')
        
    assert "Verification failed:" in exc.value.detail

def test_independent_verification_allows_rejected_entities(mock_document_parser):
    leaky_text = "Here is an allowed PAN card: XYZPW9876Q."
    
    mock_doc = CanonicalDocument(
        metadata={"filename": "test.pdf"},
        blocks=[],
        full_text=leaky_text,
        page_count=1
    )
    mock_document_parser.return_value = mock_doc
    
    allowed_entity = RedactionEntity(
        id="123",
        entity_type="PAN_CARD",
        text="XYZPW9876Q",
        score=1.0,
        page_num=1,
        status="rejected"
    )
    
    doc = fitz.open()
    doc.new_page().insert_text(fitz.Point(50,50), leaky_text)
    out = io.BytesIO()
    doc.save(out)
    
    result = VerificationEngine.verify_redacted_file(out.getvalue(), 'test.pdf', original_entities=[allowed_entity])
    assert result is True
