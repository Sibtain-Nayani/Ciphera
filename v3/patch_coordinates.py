import re

with open("backend/app/services/document_parser.py", "r") as f:
    content = f.read()

old_code = """                # Offset indices and blocks
                scale = 72.0 / 150.0
                for block in ocr_blocks:
                    block.start_index += current_index
                    block.end_index += current_index
                    if block.bbox:
                        block.bbox.x0 *= scale
                        block.bbox.y0 *= scale
                        block.bbox.x1 *= scale
                        block.bbox.y1 *= scale"""

new_code = """                # Offset indices and blocks
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
                        block.bbox.y1 *= scale_y"""

content = content.replace(old_code, new_code)

with open("backend/app/services/document_parser.py", "w") as f:
    f.write(content)
