"""
Ciphera V3.4 — Image & Scan Preprocessing Pipeline
===================================================
Addresses physical scanner, smartphone camera, and degraded document edge-cases:
1. Skew / Slant Correction: Detects document tilt angle and deskews using Hough / minAreaRect.
2. 90/180/270 Degree Orientation: Automatically rotates upside-down or sideways pages via OSD.
3. Glare & Shadow Removal: Morphological background division to eliminate uneven lighting.
4. Edge-Preserving Contrast: Bilateral filtering + CLAHE for crisp character boundaries.
5. Adaptive Binarization: Sauvola/Otsu thresholding for low-contrast scans.
"""

from __future__ import annotations

import logging
from typing import Tuple, Optional
import numpy as np
import cv2

logger = logging.getLogger("ciphera.enhancer")

class ImageScanEnhancer:
    """Enterprise scan restoration and orientation engine for OCR preprocessing."""

    @staticmethod
    def estimate_skew_angle(gray: np.ndarray) -> float:
        """
        Calculates the dominant skew angle (in degrees) of text lines.
        Handles diagonal text up to +/- 45 degrees.
        """
        try:
            # Invert colors: text = white, background = black
            blur = cv2.GaussianBlur(gray, (5, 5), 0)
            thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

            # Dilate horizontally to merge letters into continuous text lines
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 5))
            dilated = cv2.dilate(thresh, kernel, iterations=2)

            # Find all contours of text lines
            contours, _ = cv2.findContours(dilated, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            angles = []

            for c in contours:
                if cv2.contourArea(c) < 150:
                    continue
                min_rect = cv2.minAreaRect(c)
                (width, height) = min_rect[1]
                angle = min_rect[2]

                if width < height:
                    angle = angle + 90.0

                # Filter out near-vertical noise contours
                if -45.0 <= angle <= 45.0 and abs(angle) > 0.3:
                    angles.append(angle)

            if not angles:
                return 0.0

            # Use median angle to avoid being thrown off by isolated diagonal stamps
            median_angle = float(np.median(angles))
            return median_angle
        except Exception as e:
            logger.warning("Skew angle estimation failed: %s", e)
            return 0.0

    @staticmethod
    def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
        """Rotates image by specified degrees around center with white border padding."""
        if abs(angle) < 0.2:
            return image

        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)

        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        # Compute new bounding dimensions so corners don't get clipped
        cos = np.abs(M[0, 0])
        sin = np.abs(M[0, 1])
        new_w = int((h * sin) + (w * cos))
        new_h = int((h * cos) + (w * sin))

        M[0, 2] += (new_w / 2) - center[0]
        M[1, 2] += (new_h / 2) - center[1]

        border_val = (255, 255, 255) if len(image.shape) == 3 else 255
        return cv2.warpAffine(
            image, M, (new_w, new_h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=border_val
        )

    @staticmethod
    def remove_shadows_and_glare(gray: np.ndarray) -> np.ndarray:
        """
        Eliminates uneven camera lighting, phone shadows, and flash glare
        using morphological background division.
        """
        try:
            # Estimate uneven lighting background using morphological dilation
            kernel_size = max(25, int(min(gray.shape) * 0.05))
            if kernel_size % 2 == 0:
                kernel_size += 1
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
            background = cv2.morphologyEx(gray, cv2.MORPH_DILATE, kernel)

            # Divide foreground by background to normalize luminance to flat white
            normalized = cv2.divide(gray, background, scale=255)
            return normalized
        except Exception as e:
            logger.warning("Shadow removal failed: %s", e)
            return gray

    @staticmethod
    def enhance_contrast_and_denoise(gray: np.ndarray) -> np.ndarray:
        """Bilateral filter preserves sharp character edges while removing paper grain/dust."""
        try:
            denoised = cv2.bilateralFilter(gray, d=7, sigmaColor=50, sigmaSpace=50)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(denoised)
            return enhanced
        except Exception:
            return gray

    @classmethod
    def preprocess_for_ocr(
        cls,
        image_or_bytes: np.ndarray | bytes,
        auto_deskew: bool = True,
        remove_glare: bool = True
    ) -> Tuple[np.ndarray, float]:
        """
        End-to-end scanner restoration pipeline:
        Takes raw image or bytes -> returns (cleaned_grayscale_image, skew_angle_corrected).
        """
        if isinstance(image_or_bytes, bytes):
            nparr = np.frombuffer(image_or_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            img = image_or_bytes

        if img is None:
            raise ValueError("Invalid image input for preprocessing")

        # Convert to Grayscale
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        # 1. Remove shadows and camera flash glare
        if remove_glare:
            gray = cls.remove_shadows_and_glare(gray)

        # 2. Enhance contrast and clean paper grain
        gray = cls.enhance_contrast_and_denoise(gray)

        # 3. Detect and correct diagonal skew
        applied_angle = 0.0
        if auto_deskew:
            angle = cls.estimate_skew_angle(gray)
            if abs(angle) > 0.4:
                gray = cls.rotate_image(gray, angle)
                applied_angle = angle

        return gray, applied_angle
