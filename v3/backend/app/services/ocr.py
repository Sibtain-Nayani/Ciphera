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
    def extract_blocks(image_bytes: bytes, page_num: int = 1) -> Tuple[str, List[CanonicalBlock]]:
        """
        Runs Tesseract OCR on the image and returns the full text and canonical blocks (with bounding boxes).
        """
        try:
            # Preprocess image with OpenCV
            processed_img_np = OCRProcessor.preprocess_image(image_bytes)
            processed_img = Image.fromarray(processed_img_np)
        except Exception as e:
            # Fallback if cv2 fails for some reason
            processed_img = Image.open(io.BytesIO(image_bytes))

        # We request Hindi + English. PSM 3 is default (Fully automatic page segmentation)
        custom_config = r'--oem 3 --psm 3 -l hin+eng'
        
        # Get TSV data which contains bounding boxes for every word
        data = pytesseract.image_to_data(processed_img, config=custom_config, output_type=pytesseract.Output.DICT)
        
        blocks = []
        full_text = ""
        current_index = 0
        
        n_boxes = len(data['level'])
        for i in range(n_boxes):
            # level 5 means a word
            if data['level'][i] == 5:
                text = data['text'][i].strip()
                if text:
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
                    
        return full_text, blocks
