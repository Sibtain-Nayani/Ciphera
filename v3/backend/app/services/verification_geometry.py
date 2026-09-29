import fitz
from typing import List
from app.schemas.document import RedactionEntity
import re

class GeometryVerifier:
    @staticmethod
    def verify(redacted_bytes: bytes, entities: List[RedactionEntity]) -> List[str]:
        leaks = []
        doc = fitz.open(stream=redacted_bytes, filetype="pdf")
        
        for ent in entities:
            if ent.status not in ["pending", "accepted", "modified"]:
                continue
            if not ent.bbox:
                continue
            
            page_num = ent.page_num
            if page_num < 1 or page_num > len(doc):
                continue
                
            page = doc[page_num - 1]
            rect = fitz.Rect(ent.bbox.x0, ent.bbox.y0, ent.bbox.x1, ent.bbox.y1)
            
            residual_text = page.get_text("text", clip=rect).strip()
            
            if residual_text:
                clean_residual = re.sub(r'[^a-zA-Z0-9]', '', residual_text)
                if len(clean_residual) > 1:
                    leaks.append(f"Geometry Leak (Page {page_num}): Expected wiped region contains '{residual_text}'")
                    
        doc.close()
        return leaks
