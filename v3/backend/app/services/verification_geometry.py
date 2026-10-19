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
            
            # Check 1: Native residual text directly inside the target rect
            residual_text = page.get_text("text", clip=rect).strip()
            if residual_text:
                clean_residual = re.sub(r'[^a-zA-Z0-9]', '', residual_text)
                if len(clean_residual) >= 1:
                    leaks.append(f"Geometry Leak (Page {page_num}): Expected wiped region contains unredacted text")
                    continue
            
            # Clean entity string for envelope & boundary checks
            clean_text = re.sub(r'\s+', '', ent.text or '')
            text_len = len(clean_text)
            if text_len < 4:
                continue
                
            box_w = rect.width
            box_h = rect.height
            
            # Check 2: Proportional envelope width check
            # For standard horizontal text, expected width is at least text_len * 0.35 * height
            if box_h > 3.0:
                min_expected_width = text_len * box_h * 0.35
                if box_w < min_expected_width:
                    leaks.append(
                        f"Geometry Leak (Page {page_num}): Redaction bbox width ({box_w:.1f}pt) "
                        f"insufficient for entity of length {text_len} (min expected {min_expected_width:.1f}pt)"
                    )
                    continue

            # Check 3: Horizontal baseline continuation scan
            # Check immediately adjacent horizontal strips where clipped prefix or suffix characters might remain
            search_delta = max(box_h * 1.5, 30.0)
            right_strip = fitz.Rect(rect.x1, rect.y0 - 2, rect.x1 + search_delta, rect.y1 + 2)
            left_strip = fitz.Rect(max(0, rect.x0 - search_delta), rect.y0 - 2, rect.x0, rect.y1 + 2)
            
            right_text = re.sub(r'[^a-zA-Z0-9]', '', page.get_text("text", clip=right_strip))
            left_text = re.sub(r'[^a-zA-Z0-9]', '', page.get_text("text", clip=left_strip))
            
            # If immediate right strip matches suffix of clean entity text (min 3 chars)
            if len(right_text) >= 3 and clean_text.endswith(right_text):
                leaks.append(f"Geometry Leak (Page {page_num}): Trailing entity characters exposed immediately after bbox")
                continue
            elif len(right_text) >= 4 and any(clean_text.endswith(right_text[:k]) for k in range(4, len(right_text) + 1)):
                leaks.append(f"Geometry Leak (Page {page_num}): Trailing entity characters exposed immediately after bbox")
                continue

            # If immediate left strip matches prefix of clean entity text (min 3 chars)
            if len(left_text) >= 3 and clean_text.startswith(left_text):
                leaks.append(f"Geometry Leak (Page {page_num}): Leading entity characters exposed immediately before bbox")
                continue
            elif len(left_text) >= 4 and any(clean_text.startswith(left_text[-k:]) for k in range(4, len(left_text) + 1)):
                leaks.append(f"Geometry Leak (Page {page_num}): Leading entity characters exposed immediately before bbox")
                continue
                    
        doc.close()
        return leaks
