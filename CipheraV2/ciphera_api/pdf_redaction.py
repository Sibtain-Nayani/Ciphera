from fastapi import APIRouter, File, UploadFile, Form
from fastapi.responses import Response
import fitz  # PyMuPDF
import json
import logging

router = APIRouter()
logger = logging.getLogger("ciphera.pdf")

@router.post("/redact_pdf")
async def redact_pdf(
    file: UploadFile = File(...),
    shapes_json: str = Form(...),
    canvas_width: float = Form(...),
    canvas_height: float = Form(...)
):
    shapes = json.loads(shapes_json)
    
    # Read the PDF into memory
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    
    # We assume single-page editor for now based on current CipheraV2 architecture.
    # A true multi-page extension would loop through doc.
    if len(doc) > 0:
        page = doc[0]
        
        # Calculate scale factor from Canvas pixels to PDF points
        page_rect = page.rect
        scale_x = page_rect.width / canvas_width
        scale_y = page_rect.height / canvas_height
        
        # Add computational redaction annotations
        for shape in shapes:
            x0 = shape["x"] * scale_x
            y0 = shape["y"] * scale_y
            x1 = (shape["x"] + shape["width"]) * scale_x
            y1 = (shape["y"] + shape["height"]) * scale_y
            
            # Create the rectangle in PDF space
            rect = fitz.Rect(x0, y0, x1, y1)
            
            # Determine visual style based on "type"
            shape_type = shape.get("type", "blackout")
            fill_color = (0, 0, 0) if shape_type == "blackout" else (1, 1, 1)  # Blackout vs Mask (white)
            
            annot = page.add_redact_annot(rect, fill=fill_color)
            if annot:
                annot.update()
        
        # Apply all redaction annotations (computationally removes underlying text/images)
        page.apply_redactions()
            
    # Scrub metadata to prevent data leaks of author/history
    doc.set_metadata({
        "title": "Redacted Document",
        "author": "",
        "creator": "Ciphera",
        "subject": "Sanitized by Ciphera",
        "keywords": ""
    })
    
    # Return the secure, flattened binary PDF stream
    out_bytes = doc.write()
    return Response(content=out_bytes, media_type="application/pdf")
