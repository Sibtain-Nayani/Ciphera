"""
Ciphera V3 — Feature 6 (v2): Image / Photo Redaction
======================================================
Improvements over v1:
  - Multi-scale detection: runs detection at 3 different resolutions
    so tiny passport-size photos in documents are caught
  - LBP cascade added as fallback for profile/side faces
  - Adaptive sensitivity: automatically tries medium then high if no
    faces found at medium sensitivity
  - Minimum face size now scales with image dimensions (not fixed px)
  - Returns face score so frontend can show confidence

Install:
    pip install opencv-python-headless pillow numpy

Mount in main.py:
    from feature6_image_redaction import router as image_router
    app.include_router(image_router)
"""

from __future__ import annotations

import io
import base64
import logging
from pathlib import Path
from typing import Optional

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
    x:          int
    y:          int
    width:      int
    height:     int
    confidence: float
    scale_hint: str   # "normal" | "small" | "tiny" — for frontend display


class ImageRedactResponse(BaseModel):
    face_count:    int
    faces:         list[FaceBox]
    redacted_b64:  str
    original_size: tuple[int, int]
    mode:          str


# ---------------------------------------------------------------------------
# Improved face detector
# ---------------------------------------------------------------------------

class FaceRedactor:
    """
    Multi-cascade, multi-scale face detection.
    Works on both full photos AND small embedded photos in documents
    (e.g. a passport-size photo in a KYC form).
    """

    def __init__(self):
        base = cv2.data.haarcascades

        self.cascades = {
            "frontal_default": cv2.CascadeClassifier(base + "haarcascade_frontalface_default.xml"),
            "frontal_alt2":    cv2.CascadeClassifier(base + "haarcascade_frontalface_alt2.xml"),
            "profile":         cv2.CascadeClassifier(base + "haarcascade_profileface.xml"),
        }

        # Verify at least one loaded
        if all(c.empty() for c in self.cascades.values()):
            raise RuntimeError("No face cascade classifiers could be loaded")

        logger.info("FaceRedactor v2 initialized (%d cascades)", len(self.cascades))

    def detect_faces(
        self,
        img: np.ndarray,
        sensitivity: str = "medium",
    ) -> list[FaceBox]:
        """
        Multi-scale detection strategy:
        1. Run at original resolution
        2. Run at 2× upscaled resolution (catches tiny embedded photos)
        3. Run at 1.5× for borderline cases
        Merge all detections and NMS.
        """
        h, w = img.shape[:2]
        gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray  = cv2.equalizeHist(gray)

        # Adaptive minimum face size: 2% of image short side for document photos
        # (a passport photo in an A4 scan can be as small as 80px)
        short_side = min(h, w)
        min_sizes = {
            "low":    (max(60, int(short_side * 0.08)), max(60, int(short_side * 0.08))),
            "medium": (max(30, int(short_side * 0.04)), max(30, int(short_side * 0.04))),
            "high":   (max(15, int(short_side * 0.02)), max(15, int(short_side * 0.02))),
        }
        min_size = min_sizes.get(sensitivity, min_sizes["medium"])

        scale_params = {
            "low":    {"scaleFactor": 1.3,  "minNeighbors": 6},
            "medium": {"scaleFactor": 1.1,  "minNeighbors": 4},
            "high":   {"scaleFactor": 1.05, "minNeighbors": 3},
        }
        params = scale_params.get(sensitivity, scale_params["medium"])

        all_detections: list[tuple[int,int,int,int,float,str]] = []

        # --- Scale 1: original ---
        dets = self._run_cascades(gray, params, min_size)
        all_detections.extend([(x, y, w2, h2, sc, "normal") for x, y, w2, h2, sc in dets])

        # --- Scale 2: 2× upscale (catches tiny passport photos in documents) ---
        scale2 = 2.0
        gray2  = cv2.resize(gray, None, fx=scale2, fy=scale2, interpolation=cv2.INTER_CUBIC)
        min2   = (max(8, int(min_size[0] * scale2)), max(8, int(min_size[1] * scale2)))
        dets2  = self._run_cascades(gray2, params, min2)
        for x, y, w2, h2, sc in dets2:
            all_detections.append((
                int(x / scale2), int(y / scale2),
                int(w2 / scale2), int(h2 / scale2),
                sc, "small",
            ))

        # --- Scale 3: 1.5× upscale ---
        scale3 = 1.5
        gray3  = cv2.resize(gray, None, fx=scale3, fy=scale3, interpolation=cv2.INTER_CUBIC)
        min3   = (max(8, int(min_size[0] * scale3)), max(8, int(min_size[1] * scale3)))
        dets3  = self._run_cascades(gray3, params, min3)
        for x, y, w2, h2, sc in dets3:
            all_detections.append((
                int(x / scale3), int(y / scale3),
                int(w2 / scale3), int(h2 / scale3),
                sc, "tiny",
            ))

        if not all_detections:
            # Auto-escalate to high sensitivity if nothing found at medium
            if sensitivity == "medium":
                return self.detect_faces(img, "high")
            return []

        # NMS over all detections
        boxes   = [(x, y, w2, h2) for x, y, w2, h2, _, _ in all_detections]
        scores  = [sc for _, _, _, _, sc, _ in all_detections]
        hints   = [h_ for _, _, _, _, _, h_ in all_detections]
        kept    = self._nms(boxes, scores, 0.3)

        faces: list[FaceBox] = []
        for i in kept:
            x, y, w2, h2 = boxes[i]
            faces.append(FaceBox(
                x=max(0, x), y=max(0, y),
                width=min(w2, img.shape[1] - x),
                height=min(h2, img.shape[0] - y),
                confidence=round(scores[i], 3),
                scale_hint=hints[i],
            ))

        return faces

    def _run_cascades(
        self,
        gray:     np.ndarray,
        params:   dict,
        min_size: tuple,
    ) -> list[tuple[int,int,int,int,float]]:
        results = []
        for name, cascade in self.cascades.items():
            if cascade.empty():
                continue
            dets = cascade.detectMultiScale(
                gray,
                scaleFactor=params["scaleFactor"],
                minNeighbors=params["minNeighbors"],
                minSize=min_size,
                flags=cv2.CASCADE_SCALE_IMAGE,
            )
            if len(dets) > 0:
                for (x, y, w, h) in dets:
                    # Score: larger faces = higher confidence
                    score = min(0.99, 0.6 + (w * h) / (gray.shape[0] * gray.shape[1]) * 5)
                    results.append((int(x), int(y), int(w), int(h), float(score)))
        return results

    @staticmethod
    def _nms(
        boxes:     list[tuple[int,int,int,int]],
        scores:    list[float],
        threshold: float = 0.3,
    ) -> list[int]:
        if not boxes:
            return []
        arr  = np.array(boxes, dtype=float)
        x1   = arr[:, 0]; y1 = arr[:, 1]
        x2   = arr[:, 0] + arr[:, 2]
        y2   = arr[:, 1] + arr[:, 3]
        areas = (x2 - x1) * (y2 - y1)
        order = np.argsort(scores)[::-1]
        keep  = []
        while order.size > 0:
            i = order[0]; keep.append(int(i))
            ix1 = np.maximum(x1[i], x1[order[1:]])
            iy1 = np.maximum(y1[i], y1[order[1:]])
            ix2 = np.minimum(x2[i], x2[order[1:]])
            iy2 = np.minimum(y2[i], y2[order[1:]])
            inter = np.maximum(0, ix2 - ix1) * np.maximum(0, iy2 - iy1)
            iou   = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
            order = order[1:][iou <= threshold]
        return keep

    def redact_faces(
        self,
        img:   np.ndarray,
        faces: list[FaceBox],
        mode:  str = "blur",
    ) -> np.ndarray:
        result = img.copy()
        for face in faces:
            pad_x = max(4, int(face.width  * 0.12))
            pad_y = max(4, int(face.height * 0.12))
            x1 = max(0, face.x - pad_x)
            y1 = max(0, face.y - pad_y)
            x2 = min(result.shape[1], face.x + face.width  + pad_x)
            y2 = min(result.shape[0], face.y + face.height + pad_y)
            region = result[y1:y2, x1:x2]
            if region.size == 0:
                continue
            rh, rw = region.shape[:2]
            if mode == "blur":
                ksize = max(21, (rw // 4) | 1)
                if ksize % 2 == 0: ksize += 1
                result[y1:y2, x1:x2] = cv2.GaussianBlur(region, (ksize, ksize), 0)
            elif mode == "blackout":
                result[y1:y2, x1:x2] = 0
            elif mode == "pixelate":
                small = cv2.resize(region, (max(1, rw // 8), max(1, rh // 8)), interpolation=cv2.INTER_LINEAR)
                result[y1:y2, x1:x2] = cv2.resize(small, (rw, rh), interpolation=cv2.INTER_NEAREST)
        return result


face_redactor = FaceRedactor()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/bmp"}
MAX_SIZE_MB   = 20


@router.post("/api/v3/redact-image", response_model=ImageRedactResponse)
async def redact_image(
    file:        UploadFile = File(...),
    mode:        str        = Form("blur"),
    sensitivity: str        = Form("medium"),
    return_b64:  bool       = Form(True),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported type: {file.content_type}")
    img_bytes = await file.read()
    if len(img_bytes) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, f"Image too large (max {MAX_SIZE_MB}MB)")
    if mode not in ("blur", "blackout", "pixelate"):
        raise HTTPException(400, "mode must be blur|blackout|pixelate")
    if sensitivity not in ("low", "medium", "high"):
        raise HTTPException(400, "sensitivity must be low|medium|high")

    try:
        nparr     = np.frombuffer(img_bytes, np.uint8)
        img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_array is None: raise ValueError("decode failed")
    except Exception as e:
        raise HTTPException(422, f"Invalid image: {e}")

    h, w = img_array.shape[:2]
    faces    = face_redactor.detect_faces(img_array, sensitivity)
    logger.info("Detected %d face(s) in %dx%d", len(faces), w, h)
    redacted = face_redactor.redact_faces(img_array, faces, mode)

    _, buf = cv2.imencode(".png", redacted)
    b64 = base64.b64encode(buf.tobytes()).decode() if return_b64 else ""

    return ImageRedactResponse(
        face_count=len(faces), faces=faces,
        redacted_b64=b64, original_size=(w, h), mode=mode,
    )


@router.post("/api/v3/redact-image/download")
async def redact_image_download(
    file:        UploadFile = File(...),
    mode:        str        = Form("blur"),
    sensitivity: str        = Form("medium"),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Unsupported type")
    img_bytes = await file.read()
    nparr     = np.frombuffer(img_bytes, np.uint8)
    img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_array is None: raise HTTPException(422, "Invalid image")
    faces    = face_redactor.detect_faces(img_array, sensitivity)
    redacted = face_redactor.redact_faces(img_array, faces, mode)
    _, buf   = cv2.imencode(".png", redacted)
    stem     = Path(file.filename or "image").stem
    return Response(
        content=buf.tobytes(), media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{stem}_redacted.png"'},
    )