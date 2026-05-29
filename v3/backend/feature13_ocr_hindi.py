"""
Ciphera V3.1.0 — Feature 13: Hindi OCR Extraction
==================================================
Handles text extraction from:
  1. Scanned Hindi PDFs (Tesseract hin+eng)
  2. Hindi images (Aadhaar cards, PAN letters, court docs)
  3. Mixed script documents — runs both passes and merges

Tesseract setup required:
  Ubuntu:  sudo apt-get install tesseract-ocr tesseract-ocr-hin
  macOS:   brew install tesseract tesseract-lang
  Windows: download hin.traineddata → C:/Program Files/Tesseract-OCR/tessdata/

PyMuPDF setup for Hindi font mapping:
  pip install pymupdf
  No extra steps — Unicode Devanagari extracted automatically if PDF has embedded fonts.
  For image-based PDFs (no embedded text), falls through to Tesseract.
"""

from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Optional

import fitz       # PyMuPDF
import numpy as np
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    import pytesseract
    from PIL import Image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

logger = logging.getLogger("ciphera.ocr_hindi")
router = APIRouter()

# ── Tesseract language configs ─────────────────────────────────────────────────
LANG_CONFIGS = {
    "hindi":   "hin",
    "english": "eng",
    "mixed":   "hin+eng",
    "auto":    "hin+eng",
}

TESSERACT_CONFIG = "--oem 3 --psm 6"  # OEM 3 = LSTM, PSM 6 = assume uniform block of text


# ── Devanagari character normaliser ───────────────────────────────────────────

def normalise_text(text: str) -> str:
    """
    Post-OCR cleanup for Hindi text:
    - Normalise Unicode (NFC)
    - Fix common Tesseract Devanagari substitution errors
    - Collapse excessive whitespace
    """
    import unicodedata
    text = unicodedata.normalize("NFC", text)

    # Common Tesseract Hindi OCR substitutions
    substitutions = [
        ("\u0964\u0964", "\u0964"),  # double danda → single danda
        ("\u200b", ""),              # zero-width space
        ("\ufeff", ""),              # BOM
        ("\r\n", "\n"),
        ("\r", "\n"),
    ]
    for old, new in substitutions:
        text = text.replace(old, new)

    # Collapse multiple spaces (but preserve newlines)
    import re
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# ── Image pre-processing for better OCR ───────────────────────────────────────

def preprocess_for_ocr(img_array: np.ndarray) -> np.ndarray:
    """
    Pre-process image to improve Tesseract accuracy on Hindi text:
    1. Convert to grayscale
    2. Increase DPI equivalent via upscaling
    3. Adaptive threshold for better contrast
    4. Denoise
    """
    if not CV2_AVAILABLE:
        return img_array

    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_array

    # Upscale to 300 DPI equivalent (improves small text recognition)
    scale = 2.0
    h, w = gray.shape
    gray = cv2.resize(gray, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_CUBIC)

    # Adaptive thresholding — handles uneven illumination
    gray = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 11
    )

    # Denoise
    gray = cv2.fastNlMeansDenoising(gray, h=10)

    return gray


# ── Core OCR class ────────────────────────────────────────────────────────────

class HindiOCRProcessor:

    def __init__(self):
        self.tesseract_available = TESSERACT_AVAILABLE
        if self.tesseract_available:
            try:
                pytesseract.get_tesseract_version()
                # Check if Hindi language pack is installed
                langs = pytesseract.get_languages()
                self.hindi_available = "hin" in langs
                if not self.hindi_available:
                    logger.warning(
                        "Tesseract Hindi (hin) language pack not found. "
                        "Install: sudo apt-get install tesseract-ocr-hin"
                    )
            except Exception:
                self.tesseract_available = False
                self.hindi_available = False
        else:
            self.hindi_available = False
        logger.info(
            "HindiOCRProcessor — tesseract: %s, hindi: %s",
            self.tesseract_available, self.hindi_available,
        )

    def extract_from_pdf(self, pdf_bytes: bytes, language: str = "mixed") -> dict:
        """
        Extract text from a PDF with Hindi/mixed content.

        Strategy:
        1. Try PyMuPDF direct text extraction (works if PDF has embedded fonts)
        2. For pages with no extractable text (image-based), fall back to Tesseract OCR
        3. Merge results per page
        """
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_result = []
        total_deva_chars = 0

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_num = page_idx + 1

            # Try direct text extraction first
            direct_text = page.get_text("text", sort=True)

            # Count Devanagari characters in extracted text
            deva_count = sum(1 for c in direct_text if '\u0900' <= c <= '\u097F')
            total_chars = len(direct_text.strip())

            if total_chars > 50:
                # Page has extractable text
                text = normalise_text(direct_text)
                method = "direct"
            elif self.tesseract_available:
                # Image-based page — render and OCR
                text, method = self._ocr_page(page, language)
                deva_count = sum(1 for c in text if '\u0900' <= c <= '\u097F')
            else:
                text = direct_text
                method = "direct_fallback"

            total_deva_chars += deva_count
            pages_result.append({
                "page":         page_num,
                "text":         text,
                "char_count":   len(text),
                "deva_count":   deva_count,
                "method":       method,
            })

        doc.close()

        full_text = "\n".join(p["text"] for p in pages_result)
        from feature12_hindi_support import detect_script
        lang_info = detect_script(full_text)

        return {
            "pages":       pages_result,
            "full_text":   full_text,
            "page_count":  len(pages_result),
            "language":    lang_info,
            "total_chars": len(full_text),
            "total_deva":  total_deva_chars,
        }

    def _ocr_page(self, page: fitz.Page, language: str) -> tuple[str, str]:
        """Render a PDF page to image and OCR it."""
        if not self.tesseract_available:
            return "", "tesseract_unavailable"

        # Render at 300 DPI (matrix scale = 300/72)
        mat  = fitz.Matrix(300/72, 300/72)
        pix  = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
        img_data = pix.tobytes("png")

        pil_img = Image.open(io.BytesIO(img_data))

        if CV2_AVAILABLE:
            arr = np.array(pil_img)
            arr = preprocess_for_ocr(arr)
            pil_img = Image.fromarray(arr)

        lang_code = LANG_CONFIGS.get(language, "hin+eng")
        if not self.hindi_available:
            lang_code = "eng"

        try:
            text = pytesseract.image_to_string(
                pil_img, lang=lang_code, config=TESSERACT_CONFIG
            )
            return normalise_text(text), f"tesseract_{lang_code}"
        except Exception as e:
            logger.warning("Tesseract OCR failed for page: %s", e)
            return "", "tesseract_failed"

    def extract_from_image(self, img_bytes: bytes, language: str = "mixed") -> dict:
        """
        OCR a standalone image (Aadhaar card, PAN card, photo of document).
        """
        if not self.tesseract_available:
            raise RuntimeError("Tesseract not available")

        # Decode image
        arr = np.frombuffer(img_bytes, np.uint8)
        if CV2_AVAILABLE:
            import cv2
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("Could not decode image")
            processed = preprocess_for_ocr(img)
            pil_img = Image.fromarray(processed)
        else:
            pil_img = Image.open(io.BytesIO(img_bytes))

        lang_code = LANG_CONFIGS.get(language, "hin+eng")
        if not self.hindi_available:
            lang_code = "eng"

        # Run OCR
        text = pytesseract.image_to_string(pil_img, lang=lang_code, config=TESSERACT_CONFIG)
        text = normalise_text(text)

        # Also get word-level confidence
        try:
            data = pytesseract.image_to_data(
                pil_img, lang=lang_code,
                config=TESSERACT_CONFIG,
                output_type=pytesseract.Output.DICT
            )
            confidences = [int(c) for c in data['conf'] if int(c) > 0]
            avg_conf = sum(confidences) / len(confidences) if confidences else 0
        except Exception:
            avg_conf = 0

        from feature12_hindi_support import detect_script
        lang_info = detect_script(text)

        return {
            "text":        text,
            "char_count":  len(text),
            "avg_confidence": round(avg_conf, 1),
            "language":    lang_info,
            "ocr_lang":    lang_code,
        }


# ── Global instance ───────────────────────────────────────────────────────────

ocr_processor = HindiOCRProcessor()


# ── Response models ───────────────────────────────────────────────────────────

class OCRResponse(BaseModel):
    text:        str
    char_count:  int
    language:    dict
    page_count:  Optional[int] = None
    avg_confidence: Optional[float] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/v3/ocr/pdf-hindi", response_model=OCRResponse)
async def ocr_pdf_hindi(
    file:     UploadFile = File(...),
    language: str        = Form("mixed"),  # hindi | english | mixed | auto
):
    """
    Extract text from a Hindi or mixed-language PDF.
    Handles both text-based and image-based PDFs.
    Returns extracted text and language detection info.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 50 * 1024 * 1024:
        raise HTTPException(413, "PDF too large (max 50MB)")

    try:
        result = ocr_processor.extract_from_pdf(pdf_bytes, language=language)
    except Exception as e:
        logger.error("Hindi PDF OCR failed: %s", e)
        raise HTTPException(500, f"OCR failed: {e}")

    return OCRResponse(
        text=result["full_text"],
        char_count=result["total_chars"],
        language=result["language"],
        page_count=result["page_count"],
    )


@router.post("/api/v3/ocr/image-hindi", response_model=OCRResponse)
async def ocr_image_hindi(
    file:     UploadFile = File(...),
    language: str        = Form("mixed"),
):
    """
    Extract text from a Hindi document image (Aadhaar, PAN, court doc photo).
    """
    ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"}
    if file.content_type not in ALLOWED:
        raise HTTPException(400, f"Unsupported image type: {file.content_type}")

    if not ocr_processor.tesseract_available:
        raise HTTPException(503, "Tesseract OCR not available on this server")

    img_bytes = await file.read()
    if len(img_bytes) > 20 * 1024 * 1024:
        raise HTTPException(413, "Image too large (max 20MB)")

    try:
        result = ocr_processor.extract_from_image(img_bytes, language=language)
    except Exception as e:
        logger.error("Hindi image OCR failed: %s", e)
        raise HTTPException(500, f"OCR failed: {e}")

    return OCRResponse(
        text=result["text"],
        char_count=result["char_count"],
        language=result["language"],
        avg_confidence=result.get("avg_confidence"),
    )


@router.post("/api/v3/ocr/analyze-hindi-document")
async def ocr_and_analyze(
    file:      UploadFile = File(...),
    language:  str        = Form("mixed"),
    threshold: float      = Form(0.48),
):
    """
    One-shot endpoint: OCR a Hindi document then immediately run PII detection.
    Works on both PDFs and images.
    Returns extracted text + all detected PII entities.
    """
    from feature12_hindi_support import hindi_pipeline, language_detector

    file_bytes = await file.read()
    filename   = (file.filename or "").lower()

    # Extract text
    if filename.endswith(".pdf"):
        result = ocr_processor.extract_from_pdf(file_bytes, language=language)
        text   = result["full_text"]
    elif file.content_type and file.content_type.startswith("image/"):
        result = ocr_processor.extract_from_image(file_bytes, language=language)
        text   = result["text"]
    else:
        raise HTTPException(400, "Only PDF or image files accepted")

    if not text.strip():
        return {"text": "", "entity_count": 0, "entities": [], "language_info": {}}

    # Detect language
    lang_info = language_detector.detect(text)

    # Run Hindi pipeline
    entities = hindi_pipeline.run(text, threshold=threshold, language_hint=lang_info["mode"])

    return {
        "text":          text,
        "char_count":    len(text),
        "entity_count":  len(entities),
        "entities":      [e.to_dict() for e in entities],
        "language_info": lang_info,
        "stats": {
            "by_type": {
                e.entity_type: sum(1 for x in entities if x.entity_type == e.entity_type)
                for e in entities
            },
        },
    }


@router.get("/api/v3/ocr/status")
async def ocr_status():
    """Check what OCR capabilities are available on this server."""
    langs = []
    if ocr_processor.tesseract_available:
        try:
            langs = pytesseract.get_languages()
        except Exception:
            pass

    return {
        "tesseract_available": ocr_processor.tesseract_available,
        "hindi_available":     ocr_processor.hindi_available,
        "installed_languages": langs,
        "note": (
            "Install Hindi: sudo apt-get install tesseract-ocr-hin"
            if not ocr_processor.hindi_available else "Hindi OCR ready"
        ),
    }
