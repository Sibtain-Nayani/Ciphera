import os

file_path = "backend/app/services/detection_engine.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """                    if bbox and block.start_index < block.end_index:
                        # Estimate horizontal proportional bounding box for the substring
                        block_len = block.end_index - block.start_index
                        char_width = (bbox.x1 - bbox.x0) / block_len
                        
                        rel_start = overlap_start - block.start_index
                        rel_end = overlap_end - block.start_index
                        
                        exact_x0 = bbox.x0 + (rel_start * char_width)
                        exact_x1 = bbox.x0 + (rel_end * char_width)"""

replacement = """                    if bbox and block.start_index < block.end_index:
                        # Estimate horizontal proportional bounding box for the substring
                        # The parser appends a newline to block text, but the PDF bbox only covers visible chars!
                        # We must compute width using the visible length to avoid falling short at the end.
                        visible_len = len(block.text.rstrip('\\n'))
                        visible_len = max(visible_len, 1) # Prevent division by zero
                        
                        char_width = (bbox.x1 - bbox.x0) / visible_len
                        
                        rel_start = overlap_start - block.start_index
                        rel_end = overlap_end - block.start_index
                        
                        # If the entity includes the trailing newline, cap it to visible_len for bbox calc
                        rel_end = min(rel_end, visible_len)
                        
                        exact_x0 = bbox.x0 + (rel_start * char_width)
                        exact_x1 = bbox.x0 + (rel_end * char_width)
                        
                        # Add a tiny padding (1 pixel) to ensure full coverage due to font kerning
                        exact_x0 = max(bbox.x0, exact_x0 - 1)
                        exact_x1 = min(bbox.x1, exact_x1 + 2)"""

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched detection engine bounding box math.")
else:
    print("Could not find the target code in detection_engine.py!")
