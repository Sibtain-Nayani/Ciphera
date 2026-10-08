import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io
import mimetypes

from app.schemas.document import CanonicalDocument, CanonicalBlock, BoundingBox

from fastapi import HTTPException

class DocumentParser:
    """
    Phase 2: Canonical Document Engine.
    Converts any input file into a standardized CanonicalDocument (JSON representation).
    """
    
    @staticmethod
    def parse(file_bytes: bytes, filename: str) -> CanonicalDocument:
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
            
        mime_type, _ = mimetypes.guess_type(filename)
        
        if mime_type == "application/pdf" or filename.lower().endswith(".pdf"):
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
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid or corrupted PDF file: {str(e)}")
            
        if doc.is_encrypted:
            doc.close()
            raise HTTPException(status_code=400, detail="Password-protected or encrypted PDFs are not supported")
            
        if len(doc) == 0:
            doc.close()
            raise HTTPException(status_code=400, detail="PDF contains 0 pages")
        blocks = []
        full_text = ""
        current_index = 0
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            page_dict = page.get_text("dict")
            text_blocks = [b for b in page_dict.get("blocks", []) if b.get("type") == 0]
            
            page_has_text = any(
                span.get("text", "").strip()
                for b in text_blocks
                for line in b.get("lines", [])
                for span in line.get("spans", [])
            )
            
            if not page_has_text:
                # Scanned page (no embedded text) - Run OCR on rendered page image
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                
                from app.services.ocr import OCRProcessor
                ocr_text, ocr_blocks = OCRProcessor.extract_blocks(img_bytes, page_num=page_num + 1)
                
                # Offset indices and blocks
                # Dynamically calculate canonical scale (PDF points / OCR image pixels)
                scale_x = page.rect.width / pix.width if pix.width else 1.0
                scale_y = page.rect.height / pix.height if pix.height else 1.0
                
                for block in ocr_blocks:
                    block.start_index += current_index
                    block.end_index += current_index
                    if block.bbox:
                        block.bbox.x0 *= scale_x
                        block.bbox.y0 *= scale_y
                        block.bbox.x1 *= scale_x
                        block.bbox.y1 *= scale_y
                    blocks.append(block)
                
                if full_text and ocr_text:
                    full_text += "\n"
                    current_index += 1
                    
                full_text += ocr_text
                current_index += len(ocr_text)
                
            else:
                for b in text_blocks:
                    for line in b.get("lines", []):
                        line_text = "".join(span.get("text", "") for span in line.get("spans", []))
                        if not line_text.strip():
                            continue
                            
                        # Add a trailing newline for NLP context (simulates lines/paragraphs)
                        line_text += "\n"
                            
                        start_idx = current_index
                        end_idx = current_index + len(line_text)
                        full_text += line_text
                        current_index = end_idx
                        
                        lb = line["bbox"]
                        bbox = BoundingBox(x0=lb[0], y0=lb[1], x1=lb[2], y1=lb[3])
                        blocks.append(CanonicalBlock(
                            page_num=page_num + 1,
                            text=line_text,
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
