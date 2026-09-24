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
        pages = []
        full_text = ""
        current_index = 0
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_blocks = page.get_text("blocks", sort=True)
            page_width, page_height = page.rect.width, page.rect.height
            
            blocks = []
            page_has_text = False
            for b in page_blocks:
                if b[6] == 0 and b[4].strip():
                    page_has_text = True
                    break
                    
            if not page_has_text:
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                
                from app.services.ocr import OCRProcessor
                ocr_text, ocr_blocks, w, h = OCRProcessor.extract_blocks(img_bytes, page_num=page_num + 1)
                
                # Scale boxes if OCR width/height differ from PDF points width/height
                scale_x = page_width / w if w else 1.0
                scale_y = page_height / h if h else 1.0
                
                for block in ocr_blocks:
                    block.start_index += current_index
                    block.end_index += current_index
                    if block.bbox:
                        block.bbox.x0 *= scale_x
                        block.bbox.x1 *= scale_x
                        block.bbox.y0 *= scale_y
                        block.bbox.y1 *= scale_y
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
                            text=text,
                            bbox=bbox,
                            block_type="text",
                            start_index=start_idx,
                            end_index=end_idx
                        ))
            
            from app.schemas.document import CanonicalPage
            pages.append(CanonicalPage(
                page_num=page_num + 1,
                width=page_width,
                height=page_height,
                blocks=blocks
            ))
        
        metadata = {
            "filename": filename,
            "type": "pdf",
            "page_count": len(doc)
        }
        
        return CanonicalDocument(
            metadata=metadata,
            pages=pages,
            full_text=full_text,
            page_count=len(doc)
        )
        
    @staticmethod
    def _parse_text(file_bytes: bytes, filename: str) -> CanonicalDocument:
        text = file_bytes.decode('utf-8', errors='ignore')
        block = CanonicalBlock(
            text=text,
            start_index=0,
            end_index=len(text)
        )
        from app.schemas.document import CanonicalPage
        page = CanonicalPage(
            page_num=1,
            width=800.0,
            height=1000.0,
            blocks=[block]
        )
        return CanonicalDocument(
            metadata={"filename": filename, "type": "text"},
            pages=[page],
            full_text=text,
            page_count=1
        )

    @staticmethod
    def _parse_image(file_bytes: bytes, filename: str) -> CanonicalDocument:
        from app.services.ocr import OCRProcessor
        from app.schemas.document import CanonicalPage
        
        full_text, blocks, w, h = OCRProcessor.extract_blocks(file_bytes)
        
        page = CanonicalPage(
            page_num=1,
            width=w,
            height=h,
            blocks=blocks
        )
        
        return CanonicalDocument(
            metadata={"filename": filename, "type": "image"},
            pages=[page],
            full_text=full_text,
            page_count=1
        )
