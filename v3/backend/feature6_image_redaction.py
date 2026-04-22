"""
Ciphera V3 — Feature 6 (v3): Image / Photo Redaction
======================================================
Fixes over v2:
  - Aggressive NMS (IoU 0.3 → 0.5) prevents same face detected 3-4x
  - Minimum face area: face must be >= 0.8% of image area (removes false positives)
  - Single-scale at original + ONE upscale only (was 3 scales causing duplicates)
  - Removed auto-escalation to 'high' sensitivity (was the main cause of false positives)
  - Added face deduplication by centroid distance as second pass
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger("ciphera.image")
router = APIRouter()


class FaceBox(BaseModel):
    x: int; y: int; width: int; height: int
    confidence: float; scale_hint: str


class ImageRedactResponse(BaseModel):
    face_count:    int
    faces:         list[FaceBox]
    redacted_b64:  str
    original_size: tuple[int, int]
    mode:          str


class FaceRedactor:

    def __init__(self):
        base = cv2.data.haarcascades
        self.frontal = cv2.CascadeClassifier(base + "haarcascade_frontalface_default.xml")
        self.alt2    = cv2.CascadeClassifier(base + "haarcascade_frontalface_alt2.xml")
        if self.frontal.empty():
            raise RuntimeError("Could not load face cascade")
        logger.info("FaceRedactor v3 initialized")

    def detect_faces(self, img: np.ndarray, sensitivity: str = "medium") -> list[FaceBox]:
        h, w   = img.shape[:2]
        gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray   = cv2.equalizeHist(gray)
        area   = h * w

        # Minimum face area = 0.8% of image (eliminates false positives from document patterns)
        min_face_area = area * 0.008

        # Minimum face size in pixels
        short  = min(h, w)
        params = {
            "low":    {"scaleFactor": 1.3,  "minNeighbors": 7, "minSize": (max(80, int(short * 0.08)), max(80, int(short * 0.08)))},
            "medium": {"scaleFactor": 1.15, "minNeighbors": 5, "minSize": (max(50, int(short * 0.05)), max(50, int(short * 0.05)))},
            "high":   {"scaleFactor": 1.1,  "minNeighbors": 4, "minSize": (max(30, int(short * 0.03)), max(30, int(short * 0.03)))},
        }.get(sensitivity, {"scaleFactor": 1.15, "minNeighbors": 5, "minSize": (50, 50)})

        all_boxes: list[tuple[int,int,int,int,float]] = []

        # --- Scale 1: original resolution ---
        for cascade in [self.frontal, self.alt2]:
            if cascade.empty(): continue
            dets = cascade.detectMultiScale(gray, **params, flags=cv2.CASCADE_SCALE_IMAGE)
            if len(dets) > 0:
                for (x, y, bw, bh) in dets:
                    if bw * bh >= min_face_area:
                        score = min(0.99, 0.5 + (bw * bh) / area * 8)
                        all_boxes.append((x, y, bw, bh, score))

        # --- Scale 2: 1.5× upscale ONLY (not 2× — too many duplicates) ---
        scale = 1.5
        gray2 = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        min2  = (int(params["minSize"][0] * scale), int(params["minSize"][1] * scale))
        params2 = {**params, "minSize": min2}
        for cascade in [self.frontal]:
            if cascade.empty(): continue
            dets = cascade.detectMultiScale(gray2, **params2, flags=cv2.CASCADE_SCALE_IMAGE)
            if len(dets) > 0:
                for (x, y, bw, bh) in dets:
                    rx, ry, rbw, rbh = int(x/scale), int(y/scale), int(bw/scale), int(bh/scale)
                    if rbw * rbh >= min_face_area:
                        score = min(0.99, 0.5 + (rbw * rbh) / area * 8)
                        all_boxes.append((rx, ry, rbw, rbh, score))

        if not all_boxes:
            return []

        # NMS with IoU=0.5 (aggressive — removes same face detected at slightly different bounds)
        boxes  = [(x, y, w2, h2) for x, y, w2, h2, _ in all_boxes]
        scores = [s for _, _, _, _, s in all_boxes]
        kept   = self._nms(boxes, scores, iou_threshold=0.5)

        # Second pass: remove boxes whose centroid is within 20% of another kept box
        kept = self._dedup_by_centroid([(boxes[i], scores[i]) for i in kept], w)

        faces = []
        for (x, y, bw, bh), score in kept:
            faces.append(FaceBox(
                x=max(0, x), y=max(0, y),
                width=min(bw, img.shape[1]-x), height=min(bh, img.shape[0]-y),
                confidence=round(score, 3), scale_hint="normal",
            ))
        return faces

    @staticmethod
    def _nms(boxes, scores, iou_threshold=0.5) -> list[int]:
        if not boxes: return []
        arr  = np.array(boxes, dtype=float)
        x1   = arr[:,0]; y1 = arr[:,1]
        x2   = arr[:,0]+arr[:,2]; y2 = arr[:,1]+arr[:,3]
        areas = (x2-x1)*(y2-y1)
        order = np.argsort(scores)[::-1]
        keep  = []
        while order.size > 0:
            i = order[0]; keep.append(int(i))
            ix1 = np.maximum(x1[i], x1[order[1:]])
            iy1 = np.maximum(y1[i], y1[order[1:]])
            ix2 = np.minimum(x2[i], x2[order[1:]])
            iy2 = np.minimum(y2[i], y2[order[1:]])
            inter = np.maximum(0, ix2-ix1)*np.maximum(0, iy2-iy1)
            iou   = inter/(areas[i]+areas[order[1:]]-inter+1e-6)
            order = order[1:][iou <= iou_threshold]
        return keep

    @staticmethod
    def _dedup_by_centroid(boxes_scores, img_w):
        """Remove boxes whose center is within 15% of image width of another box."""
        if not boxes_scores: return []
        kept = [boxes_scores[0]]
        for (bx, by, bw, bh), score in boxes_scores[1:]:
            cx, cy = bx + bw//2, by + bh//2
            duplicate = False
            for (kx, ky, kw, kh), _ in kept:
                kcx, kcy = kx + kw//2, ky + kh//2
                dist = ((cx-kcx)**2 + (cy-kcy)**2)**0.5
                if dist < img_w * 0.15:
                    duplicate = True; break
            if not duplicate:
                kept.append(((bx, by, bw, bh), score))
        return kept

    def redact_faces(self, img: np.ndarray, faces: list[FaceBox], mode: str = "blur") -> np.ndarray:
        result = img.copy()
        for f in faces:
            pad_x = max(6, int(f.width  * 0.15))
            pad_y = max(6, int(f.height * 0.15))
            x1 = max(0, f.x - pad_x); y1 = max(0, f.y - pad_y)
            x2 = min(result.shape[1], f.x + f.width  + pad_x)
            y2 = min(result.shape[0], f.y + f.height + pad_y)
            region = result[y1:y2, x1:x2]
            if region.size == 0: continue
            rh, rw = region.shape[:2]
            if mode == "blur":
                k = max(31, (rw//3)|1)
                if k%2==0: k+=1
                result[y1:y2, x1:x2] = cv2.GaussianBlur(region, (k, k), 0)
            elif mode == "blackout":
                result[y1:y2, x1:x2] = 0
            elif mode == "pixelate":
                sm = cv2.resize(region, (max(1,rw//8), max(1,rh//8)), interpolation=cv2.INTER_LINEAR)
                result[y1:y2, x1:x2] = cv2.resize(sm, (rw, rh), interpolation=cv2.INTER_NEAREST)
        return result


face_redactor = FaceRedactor()

ALLOWED = {"image/jpeg","image/png","image/webp","image/bmp"}


@router.post("/api/v3/redact-image", response_model=ImageRedactResponse)
async def redact_image(
    file: UploadFile = File(...),
    mode: str = Form("blur"),
    sensitivity: str = Form("medium"),
    return_b64: bool = Form(True),
):
    if file.content_type not in ALLOWED:
        raise HTTPException(400, f"Unsupported: {file.content_type}")
    data = await file.read()
    if len(data) > 20*1024*1024:
        raise HTTPException(413, "Too large")
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None: raise HTTPException(422, "Invalid image")
    h, w = img.shape[:2]
    faces    = face_redactor.detect_faces(img, sensitivity)
    logger.info("Detected %d face(s) in %dx%d", len(faces), w, h)
    redacted = face_redactor.redact_faces(img, faces, mode)
    _, buf   = cv2.imencode(".png", redacted)
    b64      = base64.b64encode(buf.tobytes()).decode() if return_b64 else ""
    return ImageRedactResponse(face_count=len(faces), faces=faces, redacted_b64=b64, original_size=(w, h), mode=mode)


@router.post("/api/v3/redact-image/download")
async def redact_image_download(
    file: UploadFile = File(...),
    mode: str = Form("blur"),
    sensitivity: str = Form("medium"),
):
    if file.content_type not in ALLOWED: raise HTTPException(400, "Unsupported")
    data = await file.read()
    arr  = np.frombuffer(data, np.uint8)
    img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None: raise HTTPException(422, "Invalid image")
    faces    = face_redactor.detect_faces(img, sensitivity)
    redacted = face_redactor.redact_faces(img, faces, mode)
    _, buf   = cv2.imencode(".png", redacted)
    stem     = Path(file.filename or "image").stem
    return Response(content=buf.tobytes(), media_type="image/png",
                    headers={"Content-Disposition": f'attachment; filename="{stem}_redacted.png"'})