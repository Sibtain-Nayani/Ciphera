import re

with open("backend/app/services/document_parser.py", "r") as f:
    content = f.read()

new_pdf_logic = """    @staticmethod
    def _parse_pdf(file_bytes: bytes, filename: str) -> CanonicalDocument:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
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
                for block in ocr_blocks:
                    block.start_index += current_index
                    block.end_index += current_index
                    blocks.append(block)
                
                if full_text and ocr_text:
                    full_text += "\\n"
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
                        line_text += "\\n"
                            
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
"""

content = re.sub(r'    @staticmethod\n    def _parse_pdf\(.*?(?=\n    @staticmethod\n    def _parse_text)', new_pdf_logic, content, flags=re.DOTALL)

with open("backend/app/services/document_parser.py", "w") as f:
    f.write(content)
print("Patched document_parser.py")
