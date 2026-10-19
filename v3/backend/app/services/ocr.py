import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
from typing import List, Tuple

from app.schemas.document import CanonicalBlock, BoundingBox

class OCRProcessor:
    @staticmethod
    def preprocess_image(image_bytes: bytes) -> np.ndarray:
        """
        Enhance image for better OCR accuracy (especially for noisy Aadhaar/PAN cards).
        """
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Denoise
        denoised = cv2.fastNlMeansDenoising(gray, h=10, searchWindowSize=21, templateWindowSize=7)
        
        # Adaptive Threshold (Binarization)
        # Using THRESH_BINARY_INV might be needed depending on background, but standard is BINARY
        binary = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        return binary

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
            # Preprocess image with OpenCV
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
