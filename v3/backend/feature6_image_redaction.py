"""
Ciphera V3 — Feature 6 v4: Image Redaction with DNN Face Detection
===================================================================
Upgrades over v3 (Haar cascades):
  - Switched to OpenCV DNN face detector (res10_300x300_ssd_iter_140000)
    Ships with OpenCV — no extra download needed
  - Detects: frontal faces, profile faces, angled faces, faces with glasses
  - Falls back to Haar cascade if DNN model files not found
  - Better confidence thresholding (0.5 default, configurable)
  - Still has: NMS, centroid dedup, padding, blur/blackout/pixelate modes
"""

from __future__ import annotations

import base64
import logging
import os
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
    face_count: int
    faces: list[FaceBox]
    redacted_b64: str
    original_size: tuple[int, int]
    mode: str
    detector: str


class FaceRedactor:

    def __init__(self):
        self.dnn_net = None
        self.detector_type = "haar"
        self._load_dnn()
        if self.dnn_net is None:
            self._load_haar()

    def _load_dnn(self):
        """
        Try to load OpenCV DNN face detector.
        Model files ship with OpenCV — look in standard locations.
        """
        # Possible locations for the model files
        search_dirs = [
            os.path.dirname(cv2.__file__),
            os.path.join(os.path.dirname(cv2.__file__), "data"),
            "/usr/share/opencv4",
            "/usr/local/share/opencv4",
            str(Path.home() / ".local" / "share" / "opencv"),
            ".",
        ]

        proto_file = None
        model_file = None

        for d in search_dirs:
            p = os.path.join(d, "deploy.prototxt")
            m = os.path.join(d, "res10_300x300_ssd_iter_140000.caffemodel")
            if os.path.exists(p) and os.path.exists(m):
                proto_file = p
                model_file = m
                break
            # Also check common alternative names
            p2 = os.path.join(d, "opencv_face_detector.prototxt")
            m2 = os.path.join(d, "opencv_face_detector_uint8.pb")
            if os.path.exists(p2) and os.path.exists(m2):
                proto_file = p2
                model_file = m2
                break

        if proto_file and model_file:
            try:
                self.dnn_net = cv2.dnn.readNet(model_file, proto_file)
                self.detector_type = "dnn_ssd"
                logger.info("DNN face detector loaded: %s", model_file)
            except Exception as e:
                logger.warning("DNN load failed: %s — using Haar", e)
                self.dnn_net = None
        else:
            logger.info("DNN model files not found — using Haar cascade fallback")

    def _load_haar(self):
        base = cv2.data.haarcascades
        self.haar_frontal = cv2.CascadeClassifier(base + "haarcascade_frontalface_default.xml")
        self.haar_alt2    = cv2.CascadeClassifier(base + "haarcascade_frontalface_alt2.xml")
        self.haar_profile = cv2.CascadeClassifier(base + "haarcascade_profileface.xml")
        if self.haar_frontal.empty():
            raise RuntimeError("Could not load any face detector")
        self.detector_type = "haar_cascade"
        logger.info("Haar cascade face detector loaded (fallback)")

    # ── DNN detection ─────────────────────────────────────────────────────────

    def _detect_dnn(self, img: np.ndarray, confidence_threshold: float = 0.5) -> list[FaceBox]:
        h, w = img.shape[:2]
        blob = cv2.dnn.blobFromImage(img, 1.0, (300, 300),
                                     (104.0, 177.0, 123.0), swapRB=False, crop=False)
        self.dnn_net.setInput(blob)
        detections = self.dnn_net.forward()

        raw_boxes: list[tuple[int, int, int, int, float]] = []
        for i in range(detections.shape[2]):
            conf = float(detections[0, 0, i, 2])
            if conf < confidence_threshold:
                continue
            x1 = int(detections[0, 0, i, 3] * w)
            y1 = int(detections[0, 0, i, 4] * h)
            x2 = int(detections[0, 0, i, 5] * w)
            y2 = int(detections[0, 0, i, 6] * h)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            bw, bh = x2 - x1, y2 - y1
            if bw < 20 or bh < 20:
                continue
            raw_boxes.append((x1, y1, bw, bh, conf))

        if not raw_boxes:
            return []

        boxes  = [(x, y, bw, bh) for x, y, bw, bh, _ in raw_boxes]
        scores = [s for _, _, _, _, s in raw_boxes]
        kept   = self._nms(boxes, scores, iou_threshold=0.4)
        kept   = self._dedup_by_centroid([(boxes[i], scores[i]) for i in kept], w)

        return [
            FaceBox(x=x, y=y, width=bw, height=bh,
                    confidence=round(s, 3), scale_hint="dnn")
            for (x, y, bw, bh), s in kept
        ]

    # ── Haar fallback detection ───────────────────────────────────────────────

    def _detect_haar(self, img: np.ndarray, sensitivity: str = "medium") -> list[FaceBox]:
        h, w   = img.shape[:2]
        gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray   = cv2.equalizeHist(gray)
        area   = h * w
        min_face_area = area * 0.008
        short  = min(h, w)

        params = {
            "low":    {"scaleFactor":1.3,  "minNeighbors":7, "minSize":(max(80,int(short*0.08)),)*2},
            "medium": {"scaleFactor":1.15, "minNeighbors":5, "minSize":(max(50,int(short*0.05)),)*2},
            "high":   {"scaleFactor":1.1,  "minNeighbors":4, "minSize":(max(30,int(short*0.03)),)*2},
        }.get(sensitivity, {"scaleFactor":1.15,"minNeighbors":5,"minSize":(50,50)})

        all_boxes: list[tuple[int,int,int,int,float]] = []

        for cascade in [self.haar_frontal, self.haar_alt2]:
            if cascade.empty(): continue
            dets = cascade.detectMultiScale(gray, **params, flags=cv2.CASCADE_SCALE_IMAGE)
            if len(dets) > 0:
                for (x, y, bw, bh) in dets:
                    if bw * bh >= min_face_area:
                        score = min(0.85, 0.5 + (bw*bh)/area*8)
                        all_boxes.append((x, y, bw, bh, score))

        # Profile face (catches side-facing faces)
        if not self.haar_profile.empty():
            dets = self.haar_profile.detectMultiScale(gray, **params, flags=cv2.CASCADE_SCALE_IMAGE)
            if len(dets) > 0:
                for (x, y, bw, bh) in dets:
                    if bw * bh >= min_face_area:
                        score = min(0.75, 0.45 + (bw*bh)/area*8)
                        all_boxes.append((x, y, bw, bh, score))
            # Mirror image and run profile again (catches left-facing profiles)
            gray_flipped = cv2.flip(gray, 1)
            dets2 = self.haar_profile.detectMultiScale(gray_flipped, **params, flags=cv2.CASCADE_SCALE_IMAGE)
            if len(dets2) > 0:
                for (x, y, bw, bh) in dets2:
                    # Mirror x back
                    mx = w - x - bw
                    if bw * bh >= min_face_area:
                        score = min(0.72, 0.45 + (bw*bh)/area*8)
                        all_boxes.append((mx, y, bw, bh, score))

        # 1.5x upscale pass (catches small faces)
        scale = 1.5
        gray2 = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        params2 = {**params, "minSize": (int(params["minSize"][0]*scale),)*2}
        dets3 = self.haar_frontal.detectMultiScale(gray2, **params2, flags=cv2.CASCADE_SCALE_IMAGE)
        if len(dets3) > 0:
            for (x, y, bw, bh) in dets3:
                rx,ry,rbw,rbh = int(x/scale),int(y/scale),int(bw/scale),int(bh/scale)
                if rbw*rbh >= min_face_area:
                    score = min(0.80, 0.5+(rbw*rbh)/area*8)
                    all_boxes.append((rx,ry,rbw,rbh,score))

        if not all_boxes:
            return []

        boxes  = [(x,y,bw,bh) for x,y,bw,bh,_ in all_boxes]
        scores = [s for _,_,_,_,s in all_boxes]
        kept   = self._nms(boxes, scores, iou_threshold=0.45)
        kept   = self._dedup_by_centroid([(boxes[i], scores[i]) for i in kept], w)

        return [
            FaceBox(x=max(0,x), y=max(0,y),
                    width=min(bw,img.shape[1]-x), height=min(bh,img.shape[0]-y),
                    confidence=round(s,3), scale_hint="haar")
            for (x,y,bw,bh), s in kept
        ]

    # ── Public API ────────────────────────────────────────────────────────────

    def detect_faces(self, img: np.ndarray, sensitivity: str = "medium") -> list[FaceBox]:
        if self.dnn_net is not None:
            # Map sensitivity to DNN confidence threshold
            conf_map = {"low": 0.3, "medium": 0.5, "high": 0.65}
            return self._detect_dnn(img, confidence_threshold=conf_map.get(sensitivity, 0.5))
        return self._detect_haar(img, sensitivity)

    def redact_faces(self, img: np.ndarray, faces: list[FaceBox], mode: str = "blur") -> np.ndarray:
        result = img.copy()
        for f in faces:
            pad_x = max(8, int(f.width  * 0.18))
            pad_y = max(8, int(f.height * 0.18))
            x1 = max(0, f.x - pad_x);  y1 = max(0, f.y - pad_y)
            x2 = min(result.shape[1], f.x + f.width  + pad_x)
            y2 = min(result.shape[0], f.y + f.height + pad_y)
            region = result[y1:y2, x1:x2]
            if region.size == 0:
                continue
            rh, rw = region.shape[:2]
            if mode == "blur":
                k = max(51, (max(rw, rh)//4)|1)
                if k % 2 == 0: k += 1
                result[y1:y2, x1:x2] = cv2.GaussianBlur(region, (k, k), 30)
            elif mode == "blackout":
                result[y1:y2, x1:x2] = 0
            elif mode == "pixelate":
                sm = cv2.resize(region, (max(1,rw//10), max(1,rh//10)), interpolation=cv2.INTER_LINEAR)
                result[y1:y2, x1:x2] = cv2.resize(sm, (rw, rh), interpolation=cv2.INTER_NEAREST)
        return result

    # ── NMS + dedup ───────────────────────────────────────────────────────────

    @staticmethod
    def _nms(boxes, scores, iou_threshold=0.45) -> list[int]:
        if not boxes: return []
        arr  = np.array(boxes, dtype=float)
        x1   = arr[:,0]; y1=arr[:,1]; x2=arr[:,0]+arr[:,2]; y2=arr[:,1]+arr[:,3]
        areas = (x2-x1)*(y2-y1)
        order = np.argsort(scores)[::-1]
        keep  = []
        while order.size > 0:
            i=order[0]; keep.append(int(i))
            ix1=np.maximum(x1[i],x1[order[1:]]); iy1=np.maximum(y1[i],y1[order[1:]])
            ix2=np.minimum(x2[i],x2[order[1:]]); iy2=np.minimum(y2[i],y2[order[1:]])
            inter=np.maximum(0,ix2-ix1)*np.maximum(0,iy2-iy1)
            iou=inter/(areas[i]+areas[order[1:]]-inter+1e-6)
            order=order[1:][iou<=iou_threshold]
        return keep

    @staticmethod
    def _dedup_by_centroid(boxes_scores, img_w):
        if not boxes_scores: return []
        kept = [boxes_scores[0]]
        for (bx,by,bw,bh), score in boxes_scores[1:]:
            cx,cy = bx+bw//2, by+bh//2
            dup = False
            for (kx,ky,kw,kh), _ in kept:
                dist = ((cx-kx-kw//2)**2+(cy-ky-kh//2)**2)**0.5
                if dist < img_w*0.12:
                    dup=True; break
            if not dup:
                kept.append(((bx,by,bw,bh),score))
        return kept


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
        raise HTTPException(400, f"Unsupported type: {file.content_type}")
    data = await file.read()
    if len(data) > 20*1024*1024:
        raise HTTPException(413, "Image too large (max 20MB)")
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(422, "Could not decode image")
    h, w = img.shape[:2]
    faces    = face_redactor.detect_faces(img, sensitivity)
    logger.info("Detected %d face(s) in %dx%d image [%s]", len(faces), w, h, face_redactor.detector_type)
    redacted = face_redactor.redact_faces(img, faces, mode)
    _, buf   = cv2.imencode(".png", redacted)
    b64      = base64.b64encode(buf.tobytes()).decode() if return_b64 else ""
    return ImageRedactResponse(
        face_count=len(faces), faces=faces, redacted_b64=b64,
        original_size=(w,h), mode=mode, detector=face_redactor.detector_type,
    )


@router.post("/api/v3/redact-image/download")
async def redact_image_download(
    file: UploadFile = File(...),
    mode: str = Form("blur"),
    sensitivity: str = Form("medium"),
):
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Unsupported")
    data = await file.read()
    arr  = np.frombuffer(data, np.uint8)
    img  = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(422, "Invalid image")
    faces    = face_redactor.detect_faces(img, sensitivity)
    redacted = face_redactor.redact_faces(img, faces, mode)
    _, buf   = cv2.imencode(".png", redacted)
    stem     = Path(file.filename or "image").stem
    return Response(
        content=buf.tobytes(), media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{stem}_redacted.png"'},
    )