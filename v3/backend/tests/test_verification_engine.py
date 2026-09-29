import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from app.services.verification_engine import VerificationEngine
from app.schemas.document import CanonicalDocument, CanonicalBlock, RedactionEntity, BoundingBox

@pytest.fixture
def mock_document_parser():
    with patch('app.services.document_parser.DocumentParser.parse') as mock:
        yield mock

def test_independent_verification_success(mock_document_parser):
    clean_text = "This is a clean document. The PAN was redacted, leaving just blank space."
    
    mock_doc = CanonicalDocument(
        metadata={"filename": "test.pdf"},
        blocks=[],
        full_text=clean_text,
        page_count=1
    )
    mock_document_parser.return_value = mock_doc
    result = VerificationEngine.verify_redacted_file(b'fake', 'test.pdf')
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
    
    with pytest.raises(HTTPException) as exc:
        VerificationEngine.verify_redacted_file(b'fake', 'test.pdf')
        
    assert exc.value.status_code == 500
    assert "Verification failed:" in exc.value.detail
    assert "ABCPQ1234Z" in exc.value.detail

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
    
    result = VerificationEngine.verify_redacted_file(b'fake', 'test.pdf', original_entities=[allowed_entity])
    assert result is True

def test_luhn_checksum():
    assert VerificationEngine._passes_luhn("4111 1111 1111 1111") is True
    assert VerificationEngine._passes_luhn("4111 1111 1111 1112") is False
    
def test_pan_checksum():
    assert VerificationEngine._is_valid_pan("ABCDE1234F") is False
    assert VerificationEngine._is_valid_pan("ABCPQ1234Z") is True
    assert VerificationEngine._is_valid_pan("ABCP1234Z") is False
