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
            
            page_has_text = False
            for b in page_blocks:
                if b[6] == 0 and b[4].strip():
                    page_has_text = True
                    break
                    
            if not page_has_text:
                # Scanned page (no embedded text) - Run OCR on rendered page image
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                
                from app.services.ocr import OCRProcessor
                ocr_text, ocr_blocks = OCRProcessor.extract_blocks(img_bytes, page_num=page_num + 1)
                
                # Offset indices and blocks
                for block in ocr_blocks:
                    block.start_index += current_index
                    block.end_index += current_index
                    blocks.append(block)
                
                if full_text and ocr_text:
                    full_text += "\n"
                    current_index += 1
                    
                full_text += ocr_text
                current_index += len(ocr_text)
                
            else:
                for b in page_blocks:
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
        from app.services.ocr import OCRProcessor
        
        full_text, blocks = OCRProcessor.extract_blocks(file_bytes)
        
        return CanonicalDocument(
            metadata={"filename": filename, "type": "image"},
            blocks=blocks,
            full_text=full_text,
            page_count=1
        )
