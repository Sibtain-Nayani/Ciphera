import fitz
import io
import mimetypes
from typing import List

from app.schemas.document import CanonicalDocument, RedactionEntity

class SecureRedactionEngine:
    """
    Phase 6: Secure Redaction Engine
    Permanently destroys data from the underlying file (PDF or Image) based on accepted entities.
    It does not just draw a black box; it removes the text layer.
    """
    
    @staticmethod
    def redact_document(file_bytes: bytes, filename: str, entities: List[RedactionEntity]) -> bytes:
        mime_type, _ = mimetypes.guess_type(filename)
        
        # Filter only accepted/pending entities (we drop 'rejected' ones)
        active_entities = [e for e in entities if e.status in ["pending", "accepted", "modified"]]
        
        if mime_type == "application/pdf":
            return SecureRedactionEngine._redact_pdf(file_bytes, active_entities)
        elif mime_type and mime_type.startswith("image/"):
            return SecureRedactionEngine._redact_image(file_bytes, active_entities)
        elif mime_type == "text/plain":
            return SecureRedactionEngine._redact_text(file_bytes, active_entities)
        
        # Fallback
        return file_bytes

    @staticmethod
    def _redact_pdf(file_bytes: bytes, entities: List[RedactionEntity]) -> bytes:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        
        for ent in entities:
            # page_num in canonical is 1-indexed
            if ent.page_num < 1 or ent.page_num > len(doc):
                continue
                
            page = doc[ent.page_num - 1]
            if ent.bbox:
                rect = fitz.Rect(ent.bbox.x0, ent.bbox.y0, ent.bbox.x1, ent.bbox.y1)
                # PyMuPDF add_redact_annot prepares the redaction.
                # It marks the area for redaction and draws a black box by default.
                page.add_redact_annot(rect, fill=(0, 0, 0))
        
        # apply_redactions() permanently removes the underlying text and images in those rects!
        for page in doc:
            page.apply_redactions()
            
        out_stream = io.BytesIO()
        doc.save(out_stream)
        doc.close()
        
        return out_stream.getvalue()
        
    @staticmethod
    def _redact_image(file_bytes: bytes, entities: List[RedactionEntity]) -> bytes:
        import cv2
        import numpy as np
        
        nparr = np.frombuffer(file_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        for ent in entities:
            if ent.bbox:
                # Pixel wipe (draw solid black rectangle)
                x0, y0 = int(ent.bbox.x0), int(ent.bbox.y0)
                x1, y1 = int(ent.bbox.x1), int(ent.bbox.y1)
                cv2.rectangle(img, (x0, y0), (x1, y1), (0, 0, 0), -1)
                
        is_success, buffer = cv2.imencode(".png", img)
        if is_success:
            return buffer.tobytes()
        return file_bytes

    @staticmethod
    def _redact_text(file_bytes: bytes, entities: List[RedactionEntity]) -> bytes:
        text = file_bytes.decode('utf-8', errors='ignore')
        
        # Sort entities by start index descending so we don't mess up offsets when replacing
        # But wait, entities only have string text and no global index stored directly on RedactionEntity right now.
        # We can just do a simple string replace for text files as a fallback.
        for ent in entities:
            replacement = "\u2588" * len(ent.text) # Solid block characters
            text = text.replace(ent.text, replacement)
            
        return text.encode('utf-8')
