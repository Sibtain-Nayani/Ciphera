import pytest
from unittest.mock import patch, MagicMock
from app.services.document_parser import DocumentParser
from app.schemas.document import CanonicalBlock, BoundingBox
import fitz

@pytest.fixture
def mock_ocr():
    with patch('app.services.ocr.OCRProcessor.extract_blocks') as mock:
        yield mock

def test_geometry_150_dpi(mock_ocr):
    # Mock a PDF page with 72 PDF points width/height, but a 150 DPI pixmap
    mock_doc = MagicMock()
    mock_doc.__len__.return_value = 1
    mock_page = MagicMock()
    
    # 72 points = 1 inch
    mock_page.rect = MagicMock()
    mock_page.rect.width = 72.0
    mock_page.rect.height = 72.0
    
    # Text dict returns no text so it triggers OCR
    mock_page.get_text.return_value = {"blocks": []}
    
    # Pixmap at 150 DPI = 150 pixels per inch
    mock_pix = MagicMock()
    mock_pix.width = 150.0
    mock_pix.height = 150.0
    mock_pix.tobytes.return_value = b'fake_image'
    
    mock_page.get_pixmap.return_value = mock_pix
    mock_doc.__getitem__.return_value = mock_page
    
    # Mock OCR returning a 72x72 pixel box (which is exactly 0.48 x 0.48 inches)
    # 0.48 inches * 72 points = 34.56 points canonical
    mock_block = CanonicalBlock(
        page_num=1,
        text="test",
        start_index=0,
        end_index=4,
        bbox=BoundingBox(x0=0, y0=0, x1=72, y1=72)
    )
    mock_ocr.return_value = ("test", [mock_block])
    
    with patch('fitz.open', return_value=mock_doc):
        doc = DocumentParser._parse_pdf(b'fake', 'test.pdf')
        
    assert len(doc.blocks) == 1
    bbox = doc.blocks[0].bbox
    
    # scale = 72.0 / 150.0 = 0.48
    # 72 * 0.48 = 34.56
    assert abs(bbox.x1 - 34.56) < 0.01
    assert abs(bbox.y1 - 34.56) < 0.01

def test_geometry_300_dpi(mock_ocr):
    # Mock a PDF page with 72 PDF points width/height, but a 300 DPI pixmap
    mock_doc = MagicMock()
    mock_doc.__len__.return_value = 1
    mock_page = MagicMock()
    
    # 72 points = 1 inch
    mock_page.rect = MagicMock()
    mock_page.rect.width = 72.0
    mock_page.rect.height = 72.0
    mock_page.get_text.return_value = {"blocks": []}
    
    # Pixmap at 300 DPI = 300 pixels per inch
    mock_pix = MagicMock()
    mock_pix.width = 300.0
    mock_pix.height = 300.0
    mock_pix.tobytes.return_value = b'fake_image'
    
    mock_page.get_pixmap.return_value = mock_pix
    mock_doc.__getitem__.return_value = mock_page
    
    # Mock OCR returning a 72x72 pixel box (which is 0.24 x 0.24 inches)
    # 0.24 inches * 72 points = 17.28 points canonical
    mock_block = CanonicalBlock(
        page_num=1,
        text="test",
        start_index=0,
        end_index=4,
        bbox=BoundingBox(x0=0, y0=0, x1=72, y1=72)
    )
    mock_ocr.return_value = ("test", [mock_block])
    
    with patch('fitz.open', return_value=mock_doc):
        doc = DocumentParser._parse_pdf(b'fake', 'test.pdf')
        
    assert len(doc.blocks) == 1
    bbox = doc.blocks[0].bbox
    
    # scale = 72.0 / 300.0 = 0.24
    # 72 * 0.24 = 17.28
    assert abs(bbox.x1 - 17.28) < 0.01
    assert abs(bbox.y1 - 17.28) < 0.01

def test_geometry_native_pdf():
    # Native digital PDF, should not trigger OCR or scaling
    mock_doc = MagicMock()
    mock_doc.__len__.return_value = 1
    mock_page = MagicMock()
    
    # Native text block
    mock_page.get_text.return_value = {
        "blocks": [
            {
                "type": 0,
                "lines": [
                    {
                        "spans": [{"text": "native_test"}],
                        "bbox": [0, 0, 72.0, 72.0]
                    }
                ]
            }
        ]
    }
    
    mock_doc.__getitem__.return_value = mock_page
    
    with patch('fitz.open', return_value=mock_doc):
        doc = DocumentParser._parse_pdf(b'fake', 'test.pdf')
        
    assert len(doc.blocks) == 1
    bbox = doc.blocks[0].bbox
    
    # Should remain exactly 72.0 (1:1 scaling)
    assert bbox.x1 == 72.0
    assert bbox.y1 == 72.0
