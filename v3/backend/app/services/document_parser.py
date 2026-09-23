import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io
import mimetypes

from app.schemas.document import CanonicalDocument, CanonicalBlock, BoundingBox

class DocumentParser:
    """
    Phase 2: Canonical Document Engine.
    Converts any input file into a standardized CanonicalDocument (JSON representation).
    """
    
    @staticmethod
    def parse(file_bytes: bytes, filename: str) -> CanonicalDocument:
        mime_type, _ = mimetypes.guess_type(filename)
        
        if mime_type == "application/pdf":
            return DocumentParser._parse_pdf(file_bytes, filename)
        elif mime_type and mime_type.startswith("image/"):
            return DocumentParser._parse_image(file_bytes, filename)
        elif mime_type == "text/plain":
            return DocumentParser._parse_text(file_bytes, filename)
        else:
            # Fallback for unknown
            return DocumentParser._parse_text(file_bytes, filename)
            
    @staticmethod
    def _parse_pdf(file_bytes: bytes, filename: str) -> CanonicalDocument:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        blocks = []
        full_text = ""
        current_index = 0
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            # get_text("blocks") returns list of tuples: (x0, y0, x1, y1, text, block_no, block_type)
            page_blocks = page.get_text("blocks", sort=True)
            
            for b in page_blocks:
                # b[6] is block_type: 0 for text, 1 for image
                if b[6] == 0:
                    text = b[4]
                    if not text.strip():
                        continue
                        
                    start_idx = current_index
                    end_idx = current_index + len(text)
                    full_text += text
                    current_index = end_idx
                    
                    bbox = BoundingBox(x0=b[0], y0=b[1], x1=b[2], y1=b[3])
                    blocks.append(CanonicalBlock(
                        page_num=page_num + 1,
                        text=text,
                        bbox=bbox,
                        block_type="text",
                        start_index=start_idx,
                        end_index=end_idx
                    ))
        
        metadata = {
            "filename": filename,
            "type": "pdf",
            "page_count": len(doc)
        }
        
        return CanonicalDocument(
            metadata=metadata,
            blocks=blocks,
            full_text=full_text,
            page_count=len(doc)
        )
        
    @staticmethod
    def _parse_text(file_bytes: bytes, filename: str) -> CanonicalDocument:
        text = file_bytes.decode('utf-8', errors='ignore')
        block = CanonicalBlock(
            page_num=1,
            text=text,
            start_index=0,
            end_index=len(text)
        )
        return CanonicalDocument(
            metadata={"filename": filename, "type": "text"},
            blocks=[block],
            full_text=text,
            page_count=1
        )

    @staticmethod
    def _parse_image(file_bytes: bytes, filename: str) -> CanonicalDocument:
        # Simple OCR parsing for images
        image = Image.open(io.BytesIO(file_bytes))
        # For Phase 2 we just extract text without precise bounding boxes per word
        # In Phase 3 (OCR pipeline) this will be expanded with tesseract bounding boxes (TSV data)
        text = pytesseract.image_to_string(image)
        
        block = CanonicalBlock(
            page_num=1,
            text=text,
            start_index=0,
            end_index=len(text)
        )
        return CanonicalDocument(
            metadata={"filename": filename, "type": "image"},
            blocks=[block],
            full_text=text,
            page_count=1
        )
