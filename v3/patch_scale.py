import os

file_path = "backend/app/services/document_parser.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """                for block in ocr_blocks:
                    block.start_index += current_index
                    block.end_index += current_index
                    blocks.append(block)"""

replacement = """                scale = 72.0 / 150.0
                for block in ocr_blocks:
                    block.start_index += current_index
                    block.end_index += current_index
                    if block.bbox:
                        block.bbox.x0 *= scale
                        block.bbox.y0 *= scale
                        block.bbox.x1 *= scale
                        block.bbox.y1 *= scale
                    blocks.append(block)"""

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched successfully")
else:
    print("Target not found")
