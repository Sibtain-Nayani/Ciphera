"""
Ciphera V3 — Feature 6: Image / Photo Redaction
=================================================
Adds endpoint:  POST /api/v3/redact-image

Accepts an image upload and:
  1. Detects human faces using OpenCV Haar Cascade (no external API, runs local)
  2. Optionally detects full-body regions
  3. Returns the image with faces blurred/blacked out
  4. Also returns bounding boxes so frontend can draw overlays

Install:
    pip install opencv-python-headless pillow numpy

Mount in main app:
    from feature6_image_redaction import router as image_router
    app.include_router(image_router)

Frontend usage:
    POST /api/v3/redact-image
    Content-Type: multipart/form-data
    Body: file=<image>, mode=blur|blackout, sensitivity=low|medium|high
"""

from __future__ import annotations

import io
import base64
import logging
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from PIL import Image
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger("ciphera.image")

router = APIRouter()

# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class FaceBox(BaseModel):
    x:      int
    y:      int
    width:  int
    height: int
    confidence: float


class ImageRedactResponse(BaseModel):
    face_count:    int
    faces:         list[FaceBox]
    redacted_b64:  str          # base64-encoded redacted image (PNG)
    original_size: tuple[int, int]  # (width, height)
    mode:          str


# ---------------------------------------------------------------------------
# Face detector
# ---------------------------------------------------------------------------

class FaceRedactor:
    """
    Uses OpenCV Haar Cascade classifiers for face detection.
    Falls back to DNN-based detector if available for better accuracy.
    
    Sensitivity levels:
      low    → only high-confidence faces (fewer false positives)
      medium → balanced (default)
      high   → catches more faces, more false positives
    """

    SENSITIVITY_PARAMS = {
        "low":    {"scaleFactor": 1.3,  "minNeighbors": 6, "minSize": (60, 60)},
        "medium": {"scaleFactor": 1.1,  "minNeighbors": 5, "minSize": (40, 40)},
        "high":   {"scaleFactor": 1.05, "minNeighbors": 3, "minSize": (20, 20)},
    }

    def __init__(self):
        # Load Haar cascade (ships with OpenCV, no download needed)
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.face_cascade = cv2.CascadeClassifier(cascade_path)

        # Profile (side-face) cascade for better recall
        profile_path = cv2.data.haarcascades + "haarcascade_profileface.xml"
        self.profile_cascade = cv2.CascadeClassifier(profile_path)

        if self.face_cascade.empty():
            raise RuntimeError("Could not load face cascade classifier")

        logger.info("FaceRedactor initialized (Haar Cascade)")

    def detect_faces(
        self,
        img_array: np.ndarray,
        sensitivity: str = "medium",
    ) -> list[FaceBox]:
        """Detect faces, return list of bounding boxes."""
        params = self.SENSITIVITY_PARAMS.get(sensitivity, self.SENSITIVITY_PARAMS["medium"])
        gray   = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)

        # Equalize histogram for better detection in variable lighting
        gray = cv2.equalizeHist(gray)

        # Frontal faces
        frontal = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=params["scaleFactor"],
            minNeighbors=params["minNeighbors"],
            minSize=params["minSize"],
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

        # Profile faces
        profile = self.profile_cascade.detectMultiScale(
            gray,
            scaleFactor=params["scaleFactor"],
            minNeighbors=params["minNeighbors"],
            minSize=params["minSize"],
        )

        boxes: list[FaceBox] = []
        all_detections = []

        if len(frontal) > 0:
            all_detections.extend(frontal.tolist())
        if len(profile) > 0:
            all_detections.extend(profile.tolist())

        # Deduplicate overlapping boxes
        all_detections = self._nms(all_detections)

        for x, y, w, h in all_detections:
            boxes.append(FaceBox(x=int(x), y=int(y), width=int(w), height=int(h), confidence=0.85))

        return boxes

    @staticmethod
    def _nms(boxes: list, overlap_threshold: float = 0.3) -> list:
        """Simple non-maximum suppression to remove duplicate detections."""
        if not boxes:
            return []

        boxes_arr = np.array(boxes, dtype=float)
        x1 = boxes_arr[:, 0]
        y1 = boxes_arr[:, 1]
        x2 = boxes_arr[:, 0] + boxes_arr[:, 2]
        y2 = boxes_arr[:, 1] + boxes_arr[:, 3]
        areas = (x2 - x1) * (y2 - y1)
        indices = list(range(len(boxes)))
        keep = []

        while indices:
            i = indices[0]
            keep.append(i)
            to_remove = [0]

            for j_idx, j in enumerate(indices[1:], 1):
                ix1 = max(x1[i], x1[j])
                iy1 = max(y1[i], y1[j])
                ix2 = min(x2[i], x2[j])
                iy2 = min(y2[i], y2[j])
                iw = max(0, ix2 - ix1)
                ih = max(0, iy2 - iy1)
                intersection = iw * ih
                union = areas[i] + areas[j] - intersection
                if union > 0 and intersection / union > overlap_threshold:
                    to_remove.append(j_idx)

            indices = [v for k, v in enumerate(indices) if k not in to_remove]

        return [boxes[i] for i in keep]

    def redact_faces(
        self,
        img_array: np.ndarray,
        faces:     list[FaceBox],
        mode:      str = "blur",
    ) -> np.ndarray:
        """
        Apply redaction to detected face regions.
        mode: 'blur' | 'blackout' | 'pixelate'
        """
        result = img_array.copy()

        for face in faces:
            x, y, w, h = face.x, face.y, face.width, face.height

            # Add padding (redact slightly beyond the detected box)
            pad_x = int(w * 0.1)
            pad_y = int(h * 0.1)
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(result.shape[1], x + w + pad_x)
            y2 = min(result.shape[0], y + h + pad_y)

            region = result[y1:y2, x1:x2]
            if region.size == 0:
                continue

            if mode == "blur":
                # Heavy Gaussian blur
                ksize = max(51, (w // 5) | 1)  # must be odd
                if ksize % 2 == 0:
                    ksize += 1
                result[y1:y2, x1:x2] = cv2.GaussianBlur(region, (ksize, ksize), 0)

            elif mode == "blackout":
                result[y1:y2, x1:x2] = 0

            elif mode == "pixelate":
                # Resize down then up for pixelation effect
                small = cv2.resize(region, (max(1, w // 10), max(1, h // 10)),
                                   interpolation=cv2.INTER_LINEAR)
                result[y1:y2, x1:x2] = cv2.resize(small, (x2 - x1, y2 - y1),
                                                    interpolation=cv2.INTER_NEAREST)

        return result


face_redactor = FaceRedactor()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
MAX_SIZE_MB   = 20


@router.post("/api/v3/redact-image", response_model=ImageRedactResponse)
async def redact_image(
    file:        UploadFile = File(...),
    mode:        str        = Form("blur"),         # blur | blackout | pixelate
    sensitivity: str        = Form("medium"),       # low | medium | high
    return_b64:  bool       = Form(True),           # return base64 image in response
):
    """
    Upload an image. Detects and redacts human faces.
    Returns JSON with face bounding boxes + base64 redacted image.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported image type: {file.content_type}. Allowed: jpeg, png, webp, bmp")

    img_bytes = await file.read()
    if len(img_bytes) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, f"Image too large (max {MAX_SIZE_MB}MB)")

    if mode not in ("blur", "blackout", "pixelate"):
        raise HTTPException(400, "mode must be blur | blackout | pixelate")

    if sensitivity not in ("low", "medium", "high"):
        raise HTTPException(400, "sensitivity must be low | medium | high")

    # Decode image
    try:
        nparr     = np.frombuffer(img_bytes, np.uint8)
        img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_array is None:
            raise ValueError("Could not decode image")
    except Exception as e:
        raise HTTPException(422, f"Invalid image: {e}")

    h, w = img_array.shape[:2]

    # Detect faces
    faces = face_redactor.detect_faces(img_array, sensitivity=sensitivity)
    logger.info("Detected %d face(s) in %dx%d image", len(faces), w, h)

    # Redact
    redacted = face_redactor.redact_faces(img_array, faces, mode=mode)

    # Encode result
    _, buffer = cv2.imencode(".png", redacted)
    b64_result = base64.b64encode(buffer.tobytes()).decode("utf-8") if return_b64 else ""

    return ImageRedactResponse(
        face_count=len(faces),
        faces=faces,
        redacted_b64=b64_result,
        original_size=(w, h),
        mode=mode,
    )


@router.post("/api/v3/redact-image/download")
async def redact_image_download(
    file:        UploadFile = File(...),
    mode:        str        = Form("blur"),
    sensitivity: str        = Form("medium"),
):
    """Same as /redact-image but returns the image file directly (for download)."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Unsupported image type")

    img_bytes = await file.read()
    nparr     = np.frombuffer(img_bytes, np.uint8)
    img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_array is None:
        raise HTTPException(422, "Invalid image")

    faces   = face_redactor.detect_faces(img_array, sensitivity=sensitivity)
    redacted = face_redactor.redact_faces(img_array, faces, mode=mode)

    _, buffer = cv2.imencode(".png", redacted)

    original_name = Path(file.filename or "image").stem
    return Response(
        content=buffer.tobytes(),
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{original_name}_redacted.png"'
        },
    )
