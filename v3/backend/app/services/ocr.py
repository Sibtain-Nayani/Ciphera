import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
from typing import List, Tuple

from app.schemas.document import CanonicalBlock, BoundingBox
from app.services.image_enhancer import ImageScanEnhancer

class OCRProcessor:
    @staticmethod
    def preprocess_image(image_bytes: bytes) -> np.ndarray:
        """
        Enhance scanned images for higher OCR accuracy on physical IDs, cards, and bills.
        Applies automated deskewing, glare/shadow removal, and contrast enhancement.
        """
        try:
            cleaned, angle = ImageScanEnhancer.preprocess_for_ocr(
                image_bytes, auto_deskew=True, remove_glare=True
            )
            return cleaned
        except Exception:
            # Safe fallback if advanced processing encounters an unexpected format
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            if img is not None:
                return img
            return np.zeros((100, 100), dtype=np.uint8)

    @staticmethod
    def extract_blocks_with_stats(
        image_bytes: bytes, page_num: int = 1
    ) -> Tuple[str, List[CanonicalBlock], dict]:
        """
        Runs Tesseract OCR on the image and returns:
        - full text
        - canonical blocks (with bounding boxes)
        - ocr_stats: dict containing word_count, confidences, mean_confidence, alphanumeric_char_count, total_char_count, raw_text
        """
        try:
            # Preprocess image with OpenCV (deskew + glare removal)
            processed_img_np = OCRProcessor.preprocess_image(image_bytes)
            processed_img = Image.fromarray(processed_img_np)
        except Exception:
            # Fallback if cv2 fails for some reason
            processed_img = Image.open(io.BytesIO(image_bytes))

        # We request Hindi + English. PSM 3 is default (Fully automatic page segmentation)
        custom_config = r'--oem 3 --psm 3 -l hin+eng'
        
        # Get TSV data which contains bounding boxes for every word
        data = pytesseract.image_to_data(processed_img, config=custom_config, output_type=pytesseract.Output.DICT)
        
        blocks = []
        full_text = ""
        current_index = 0
        confidences = []
        alnum_chars = 0
        
        n_boxes = len(data.get('level', []))
        for i in range(n_boxes):
            # level 5 means a word
            if data['level'][i] == 5:
                text = str(data['text'][i]).strip()
                if text:
                    # Extract confidence if available
                    if 'conf' in data:
                        try:
                            c = float(data['conf'][i])
                            if c >= 0:
                                confidences.append(c)
                        except (ValueError, TypeError):
                            pass
                            
                    # Count alphanumeric characters in word
                    alnum_in_word = sum(1 for ch in text if ch.isalnum())
                    alnum_chars += alnum_in_word
                    
                    # Append text to full string with a space
                    if full_text:
                        full_text += " "
                        current_index += 1
                        
                    start_idx = current_index
                    end_idx = current_index + len(text)
                    full_text += text
                    current_index = end_idx
                    
                    (x, y, w, h) = (data['left'][i], data['top'][i], data['width'][i], data['height'][i])
                    
                    bbox = BoundingBox(x0=x, y0=y, x1=x+w, y1=y+h)
                    
                    blocks.append(CanonicalBlock(
                        page_num=page_num,
                        text=text,
                        bbox=bbox,
                        block_type="text",
                        start_index=start_idx,
                        end_index=end_idx
                    ))
                    
        mean_conf = float(np.mean(confidences)) if len(confidences) > 0 else None
        
        ocr_stats = {
            "word_count": len(blocks),
            "confidences": confidences,
            "mean_confidence": mean_conf,
            "alphanumeric_char_count": alnum_chars,
            "total_char_count": len(full_text),
            "raw_text": full_text,
        }
        
        return full_text, blocks, ocr_stats

    @staticmethod
    def extract_blocks(image_bytes: bytes, page_num: int = 1) -> Tuple[str, List[CanonicalBlock]]:
        """
        Runs Tesseract OCR on the image and returns the full text and canonical blocks (with bounding boxes).
        """
        full_text, blocks, _ = OCRProcessor.extract_blocks_with_stats(image_bytes, page_num)
        return full_text, blocks
