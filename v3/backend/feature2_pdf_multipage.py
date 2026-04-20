"""
Ciphera V3 — Feature 2: Multi-Page PDF Redaction
==================================================
Adds a new endpoint:  POST /api/v3/analyze-pdf

Accepts a PDF file upload, processes EVERY page, and returns:
  - entities per page (with page number + char offsets within that page)
  - full_text (concatenated, with page breaks)
  - page_map: list of {page, start_offset, end_offset} so frontend
    can map global char offset → page number

The frontend can use page_map to render redaction overlays on each
PDF page canvas independently.

Install:
    pip install pymupdf fastapi python-multipart

Usage in FastAPI — mount this router in your main app:
    from feature2_pdf import router as pdf_router
    app.include_router(pdf_router)
"""

from __future__ import annotations

import io
import logging
from typing import Optional, TYPE_CHECKING

import fitz  # PyMuPDF
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pydantic import BaseModel

if TYPE_CHECKING:
    from feature1_pipeline_upgrade import DetectionPipeline

logger = logging.getLogger("ciphera.pdf")

router = APIRouter()

# Will be set by main app after pipeline is initialized
_pipeline: Optional["DetectionPipeline"] = None


def set_pipeline(p: "DetectionPipeline"):
    global _pipeline
    _pipeline = p


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class PageEntity(BaseModel):
    page:        int       # 1-indexed
    start:       int       # char offset within that page's text
    end:         int
    global_start: int      # char offset in full concatenated text
    global_end:   int
    entity_type: str
    text:        str
    score:       float
    source:      str


class PageInfo(BaseModel):
    page:         int
    start_offset: int   # global offset where this page starts
    end_offset:   int   # global offset where this page ends
    char_count:   int
    word_count:   int


class PDFAnalyzeResponse(BaseModel):
    page_count:   int
    full_text:    str
    page_map:     list[PageInfo]
    entities:     list[PageEntity]
    entity_count: int
    stats:        dict


# ---------------------------------------------------------------------------
# Core PDF processor
# ---------------------------------------------------------------------------

class PDFProcessor:
    """
    Extracts text from every page of a PDF using PyMuPDF (fitz).
    Preserves layout order (left-to-right, top-to-bottom).
    """

    def extract_pages(self, pdf_bytes: bytes) -> list[tuple[int, str]]:
        """
        Returns list of (page_number_1indexed, page_text).
        """
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages = []
        for i, page in enumerate(doc, start=1):
            # "text" mode preserves reading order
            text = page.get_text("text", sort=True)
            pages.append((i, text))
        doc.close()
        return pages

    def build_full_text_and_map(
        self, pages: list[tuple[int, str]]
    ) -> tuple[str, list[PageInfo]]:
        """
        Concatenates all page texts with a page-break marker.
        Returns (full_text, page_map).
        """
        full_text = ""
        page_map: list[PageInfo] = []

        for page_num, page_text in pages:
            start_offset = len(full_text)
            full_text += page_text
            # Add a newline separator between pages (not inside page text)
            if page_num < len(pages):
                full_text += "\n"
            end_offset = len(full_text)

            page_map.append(PageInfo(
                page=page_num,
                start_offset=start_offset,
                end_offset=end_offset,
                char_count=len(page_text),
                word_count=len(page_text.split()),
            ))

        return full_text, page_map


pdf_processor = PDFProcessor()


def _map_entity_to_page(
    global_start: int,
    global_end:   int,
    page_map:     list[PageInfo],
) -> Optional[PageInfo]:
    """Find which page a global char offset belongs to."""
    for page_info in page_map:
        if page_info.start_offset <= global_start < page_info.end_offset:
            return page_info
    return None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/api/v3/analyze-pdf", response_model=PDFAnalyzeResponse)
async def analyze_pdf(
    file:      UploadFile = File(...),
    threshold: float      = Form(0.50),
    pages:     str        = Form("all"),   # "all" or "1,2,5" or "1-3"
):
    """
    Upload a PDF. Get back entity detections for every page (or specified pages).

    pages param examples:
      "all"    → process all pages
      "1,2,3"  → process pages 1, 2, 3
      "1-5"    → process pages 1 through 5
    """
    if _pipeline is None:
        raise HTTPException(503, "Pipeline not ready")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted")

    pdf_bytes = await file.read()
    if len(pdf_bytes) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(413, "PDF too large (max 50MB)")

    try:
        raw_pages = pdf_processor.extract_pages(pdf_bytes)
    except Exception as e:
        logger.error("PDF extraction failed: %s", e)
        raise HTTPException(422, f"Could not read PDF: {e}")

    # Filter pages if specified
    selected_page_nums = _parse_page_selection(pages, len(raw_pages))
    filtered_pages = [(n, t) for n, t in raw_pages if n in selected_page_nums]

    if not filtered_pages:
        raise HTTPException(400, "No valid pages selected")

    full_text, page_map = pdf_processor.build_full_text_and_map(filtered_pages)

    # Run detection on full concatenated text (better cross-page context)
    raw_entities = _pipeline.run(full_text, threshold=threshold)

    # Map each entity back to its page
    page_entities: list[PageEntity] = []
    for entity in raw_entities:
        page_info = _map_entity_to_page(entity.start, entity.end, page_map)
        if page_info is None:
            continue

        local_start = entity.start - page_info.start_offset
        local_end   = entity.end   - page_info.start_offset

        page_entities.append(PageEntity(
            page=page_info.page,
            start=local_start,
            end=local_end,
            global_start=entity.start,
            global_end=entity.end,
            entity_type=entity.entity_type,
            text=entity.text,
            score=round(entity.score, 4),
            source=entity.source.value,
        ))

    # Stats
    type_counts: dict[str, int] = {}
    page_counts: dict[int, int] = {}
    for e in page_entities:
        type_counts[e.entity_type] = type_counts.get(e.entity_type, 0) + 1
        page_counts[e.page]        = page_counts.get(e.page, 0) + 1

    return PDFAnalyzeResponse(
        page_count=len(filtered_pages),
        full_text=full_text,
        page_map=page_map,
        entities=page_entities,
        entity_count=len(page_entities),
        stats={
            "by_type":  type_counts,
            "by_page":  page_counts,
            "pages_processed": len(filtered_pages),
        },
    )


@router.get("/api/v3/analyze-pdf/page-count")
async def get_page_count(filename: str):
    """Utility: returns page count without full processing (not used in main flow)."""
    return {"message": "Upload the file to /api/v3/analyze-pdf with pages=all"}


# ---------------------------------------------------------------------------
# Page selection parser
# ---------------------------------------------------------------------------

def _parse_page_selection(pages_str: str, total_pages: int) -> set[int]:
    """
    "all"    → {1, 2, ..., total_pages}
    "1,3,5"  → {1, 3, 5}
    "2-6"    → {2, 3, 4, 5, 6}
    "1,3-5"  → {1, 3, 4, 5}
    """
    if pages_str.strip().lower() == "all":
        return set(range(1, total_pages + 1))

    result: set[int] = set()
    for part in pages_str.split(","):
        part = part.strip()
        if "-" in part:
            try:
                start, end = part.split("-", 1)
                result.update(range(int(start), int(end) + 1))
            except ValueError:
                pass
        else:
            try:
                result.add(int(part))
            except ValueError:
                pass

    # Clamp to valid range
    return {p for p in result if 1 <= p <= total_pages}
