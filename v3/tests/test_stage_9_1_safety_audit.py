"""
Stage 9.1: Post-Benchmark Safety & Security Regression Test Suite
=================================================================
Verifies Workstream A (Degraded-Scan Release Safety) and Workstream C (Security Regression)
using development-only synthetic fixtures.

Test Cases:
1. Low-Contrast Degraded Scan: Insufficient OCR readability traps as VerificationUncertainty.
2. Skewed Degraded Scan: Distorted raster rendering traps as VerificationUncertainty.
3. Noisy Degraded Scan: Heavy Gaussian/salt-and-pepper noise traps as VerificationUncertainty.
4. Partial OCR Degraded Scan: Negligible alphanumeric yield (1-3 chars) traps as VerificationUncertainty.
5. Garbled OCR Degraded Scan: Predominantly non-alphanumeric noise traps as VerificationUncertainty.
6. Zero OCR Yield Degraded Scan: Visual ink with zero alphanumeric chars traps as VerificationUncertainty.
7. Clean Blank Page: Empty separator page correctly passes without false uncertainty rejection.
8. End-to-End Pipeline Containment: Uncertain scan sets REVIEW_REQUIRED, clears result_storage_key, sets VERIFICATION_FAILED.
9. Download Endpoint Security: Blocks PENDING (400), FAILED (400), and REVIEW_REQUIRED (422); prevents artifact release.
10. Valid Completed Job: Successfully downloads artifact (200).
11. Tenant Isolation & IDOR Protection: Cross-tenant download is blocked (404).
12. Path Traversal Containment: Malicious traversal keys in storage are blocked (403).
"""

import os
import io
import sys
import uuid
import unittest
from unittest.mock import patch
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import fitz
from fastapi import HTTPException

# Ensure backend and root are in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.models.document import Document, JobStatus, SafetyStatus, RedactionJob
from app.models.identity import User, OrganizationMember
from app.schemas.document import RedactionEntity
from app.services.verification_engine import (
    VerificationEngine,
    VerificationFailure,
    VerificationUncertainty,
)
from app.services.storage import StorageService
from app.services.ocr import OCRProcessor
from app.tasks.redaction_tasks import process_redaction
from app.core.database import SessionLocal, Base, engine
from app.api.documents import download_redacted_job
from app.core.config import settings


def create_scanned_pdf_from_image(img: Image.Image) -> bytes:
    """Converts a PIL Image to a single-page scanned PDF."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    doc = fitz.open()
    page = doc.new_page(width=img.width, height=img.height)
    page.insert_image(fitz.Rect(0, 0, img.width, img.height), stream=buf.getvalue())
    b = doc.tobytes()
    doc.close()
    return b


def create_native_pdf_from_lines(lines: list) -> bytes:
    """Creates a native digital PDF with embedded text."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 100
    for line in lines:
        page.insert_text((50, y), line, fontsize=11, fontname="helv")
        y += 25
    b = doc.tobytes()
    doc.close()
    return b


class TestStage91SafetyAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()

        # Seed test organizations and users for tenant isolation tests
        cls.org_id_1 = str(uuid.uuid4())
        cls.org_id_2 = str(uuid.uuid4())
        cls.user_1_id = str(uuid.uuid4())
        cls.user_2_id = str(uuid.uuid4())

        cls.user_1 = User(id=cls.user_1_id, email="tenant1_stage91@example.com", global_role="user")
        cls.user_2 = User(id=cls.user_2_id, email="tenant2_stage91@example.com", global_role="user")

        cls.user_1.org_memberships = [OrganizationMember(user_id=cls.user_1_id, org_id=cls.org_id_1, role="member")]
        cls.user_2.org_memberships = [OrganizationMember(user_id=cls.user_2_id, org_id=cls.org_id_2, role="member")]

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    # -------------------------------------------------------------------------
    # Fixture 1: Low-Contrast Degraded Scan
    # -------------------------------------------------------------------------
    def test_01_low_contrast_degraded_scan_uncertainty(self):
        """Scanned document with ultra-low contrast text triggers VerificationUncertainty."""
        # Create image with white background and faint low-contrast gray text
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        # Faint lines
        for y in range(100, 600, 25):
            draw.text((50, y), "Faint illegible scanned text 9876543210 low contrast receipt line", fill=(215, 215, 215))
        pdf_bytes = create_scanned_pdf_from_image(img)

        # Mock OCR output to reflect low-confidence / unreadable yield
        mock_stats = {
            "total_char_count": 8,
            "alphanumeric_char_count": 2,
            "word_count": 1,
            "mean_confidence": 20.0
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("F.", [], mock_stats)):
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "low_contrast.pdf", [])
            self.assertIn("Uncertainty Failure", ctx.exception.detail)

    # -------------------------------------------------------------------------
    # Fixture 2: Skewed Degraded Scan
    # -------------------------------------------------------------------------
    def test_02_skewed_degraded_scan_uncertainty(self):
        """Scanned document with heavy rotation/skew producing partial garbled OCR traps uncertainty."""
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.text((100, 200), "Rotated Challan #998877", fill=(0, 0, 0))
        # Rotate image heavily
        img = img.rotate(45, expand=False, fillcolor=(255, 255, 255))
        pdf_bytes = create_scanned_pdf_from_image(img)

        mock_stats = {
            "total_char_count": 25,
            "alphanumeric_char_count": 4,
            "word_count": 2,
            "mean_confidence": 35.0
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("//--..~`", [], mock_stats)):
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "skewed.pdf", [])
            self.assertIn("Uncertainty Failure", ctx.exception.detail)

    # -------------------------------------------------------------------------
    # Fixture 3: Noisy Degraded Scan (Gaussian / Artifact Noise)
    # -------------------------------------------------------------------------
    def test_03_noisy_degraded_scan_uncertainty(self):
        """Heavy salt-and-pepper / scanner noise causing low-confidence garbled yield triggers uncertainty."""
        arr = np.random.randint(0, 256, (800, 600, 3), dtype=np.uint8)
        img = Image.fromarray(arr)
        pdf_bytes = create_scanned_pdf_from_image(img)

        mock_stats = {
            "total_char_count": 15,
            "alphanumeric_char_count": 2,
            "word_count": 1,
            "mean_confidence": 15.0
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("::;;", [], mock_stats)):
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "noisy.pdf", [])
            self.assertIn("Uncertainty Failure", ctx.exception.detail)

    # -------------------------------------------------------------------------
    # Fixture 4: Partial OCR Scan (Negligible Alphanumeric Yield)
    # -------------------------------------------------------------------------
    def test_04_partial_ocr_negligible_yield_uncertainty(self):
        """Page with visual ink where OCR returns only 1-3 alphanumeric characters traps as uncertainty."""
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        # Heavy ink stamps and drawings
        draw.rectangle([50, 50, 400, 400], fill=(50, 50, 50))
        pdf_bytes = create_scanned_pdf_from_image(img)

        mock_stats = {
            "total_char_count": 3,
            "alphanumeric_char_count": 2,
            "word_count": 1,
            "mean_confidence": 40.0
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("X1", [], mock_stats)):
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "partial.pdf", [])
            self.assertIn("Negligible OCR yield", ctx.exception.detail)

    # -------------------------------------------------------------------------
    # Fixture 5: Garbled OCR Scan (Predominantly Non-Alphanumeric Noise)
    # -------------------------------------------------------------------------
    def test_05_garbled_ocr_symbol_noise_uncertainty(self):
        """Page where OCR yield is predominantly punctuation and symbols triggers uncertainty."""
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.text((100, 100), "!!!###$$$%%%^^^&&&***", fill=(0, 0, 0))
        pdf_bytes = create_scanned_pdf_from_image(img)

        mock_stats = {
            "total_char_count": 30,
            "alphanumeric_char_count": 3,
            "word_count": 2,
            "mean_confidence": 30.0
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("!@#$%^&*()_+~`", [], mock_stats)):
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "garbled.pdf", [])
            detail = ctx.exception.detail
            self.assertTrue("Garbled OCR output" in detail or "OCR extraction quality too low" in detail)

    # -------------------------------------------------------------------------
    # Fixture 6: Zero OCR Yield on Visual Page
    # -------------------------------------------------------------------------
    def test_06_zero_ocr_yield_uncertainty(self):
        """Page with visual ink where OCR extracts zero characters traps uncertainty."""
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.line([(50, 50), (550, 750)], fill=(0, 0, 0), width=10)
        pdf_bytes = create_scanned_pdf_from_image(img)

        mock_stats = {
            "total_char_count": 0,
            "alphanumeric_char_count": 0,
            "word_count": 0,
            "mean_confidence": None
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("", [], mock_stats)):
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "zero_yield.pdf", [])
            self.assertIn("zero alphanumeric characters", ctx.exception.detail)

    # -------------------------------------------------------------------------
    # Fixture 7: Clean Blank Page
    # -------------------------------------------------------------------------
    def test_07_clean_blank_page_passes_without_uncertainty(self):
        """A clean blank page without ink passes cleanly without false rejection."""
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        pdf_bytes = create_scanned_pdf_from_image(img)

        # Verification should pass cleanly without raising VerificationUncertainty
        VerificationEngine.verify_redacted_file(pdf_bytes, "blank_separator.pdf", [])

    # -------------------------------------------------------------------------
    # Test 8: End-to-End Pipeline Containment (Workstream C)
    # -------------------------------------------------------------------------
    def test_08_uncertain_scanned_document_pipeline_containment(self):
        """Uncertain scanned document halts pipeline, marks REVIEW_REQUIRED, and clears storage key."""
        # Create scanned document
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.rectangle([100, 100, 300, 300], fill=(100, 100, 100))
        pdf_bytes = create_scanned_pdf_from_image(img)

        storage_key = StorageService.save_document(pdf_bytes, "uncertain_pipeline_test.pdf", directory="uploads")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="uncertain_pipeline_test.pdf",
            storage_key=storage_key,
            safety_status=SafetyStatus.UNVERIFIED,
            detected_entities=[]
        )
        self.db.add(doc_rec)
        self.db.commit()

        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.QUEUED,
            result_storage_key=None
        )
        self.db.add(job)
        self.db.commit()

        mock_stats = {
            "total_char_count": 0,
            "alphanumeric_char_count": 0,
            "word_count": 0,
            "mean_confidence": None
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("", [], mock_stats)):
            result = process_redaction(job.id)

        self.db.refresh(job)
        self.db.refresh(doc_rec)

        # Verify containment state
        self.assertEqual(job.status, JobStatus.REVIEW_REQUIRED)
        self.assertIsNone(job.result_storage_key, "Artifact key MUST be None on uncertainty!")
        self.assertEqual(doc_rec.safety_status, SafetyStatus.VERIFICATION_FAILED)
        self.assertIn("reason", result)

    # -------------------------------------------------------------------------
    # Test 9: Download Endpoint Blocks Non-Completed Jobs (Workstream C)
    # -------------------------------------------------------------------------
    def test_09_download_endpoint_blocks_unverified_and_uncertain_jobs(self):
        """Download endpoint strictly returns 400 for QUEUED/PROCESSING/FAILED and 422 for REVIEW_REQUIRED."""
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="download_block_test.pdf"
        )
        self.db.add(doc_rec)

        # 9a: QUEUED -> 400
        job_queued = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.QUEUED)
        # 9b: PROCESSING -> 400
        job_processing = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.PROCESSING)
        # 9c: FAILED -> 400
        job_failed = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.FAILED)
        # 9d: REVIEW_REQUIRED -> 422
        job_review = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.REVIEW_REQUIRED)

        self.db.add_all([job_queued, job_processing, job_failed, job_review])
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx_queued:
            download_redacted_job(job_queued.id, self.db, self.user_1)
        self.assertEqual(ctx_queued.exception.status_code, 400)

        with self.assertRaises(HTTPException) as ctx_processing:
            download_redacted_job(job_processing.id, self.db, self.user_1)
        self.assertEqual(ctx_processing.exception.status_code, 400)

        with self.assertRaises(HTTPException) as ctx_failed:
            download_redacted_job(job_failed.id, self.db, self.user_1)
        self.assertEqual(ctx_failed.exception.status_code, 400)

        with self.assertRaises(HTTPException) as ctx_review:
            download_redacted_job(job_review.id, self.db, self.user_1)
        self.assertEqual(ctx_review.exception.status_code, 422)

    # -------------------------------------------------------------------------
    # Test 10: Valid Completed Job Downloads Successfully (Workstream C)
    # -------------------------------------------------------------------------
    def test_10_valid_completed_job_downloads_successfully(self):
        """A verified completed job downloads its redacted artifact with HTTP 200."""
        pdf_bytes = create_native_pdf_from_lines(["VALID COMPLIANCE REPORT", "All clear"])
        key = StorageService.save_document(pdf_bytes, "valid_report.pdf", directory="redacted")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="valid_report.pdf",
            safety_status=SafetyStatus.VERIFIED
        )
        self.db.add(doc_rec)
        self.db.commit()

        job_completed = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key=key
        )
        self.db.add(job_completed)
        self.db.commit()

        response = download_redacted_job(job_completed.id, self.db, self.user_1)
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 200)

    # -------------------------------------------------------------------------
    # Test 11: Cross-Tenant Access & IDOR Containment (Workstream C)
    # -------------------------------------------------------------------------
    def test_11_cross_tenant_isolation(self):
        """User from Org 2 cannot download or access job from Org 1 (HTTP 404)."""
        pdf_bytes = create_native_pdf_from_lines(["CONFIDENTIAL ORG 1 DATA"])
        key = StorageService.save_document(pdf_bytes, "org1_secret.pdf", directory="redacted")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="org1_secret.pdf"
        )
        self.db.add(doc_rec)
        self.db.commit()

        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key=key
        )
        self.db.add(job)
        self.db.commit()

        # User 2 belongs to Org 2
        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job.id, self.db, self.user_2)
        self.assertEqual(ctx.exception.status_code, 404)

    # -------------------------------------------------------------------------
    # Test 12: Path Traversal Containment (Workstream C)
    # -------------------------------------------------------------------------
    def test_12_path_traversal_containment(self):
        """Malicious storage keys with directory traversal are rejected with HTTP 403."""
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="traversal_test.pdf"
        )
        self.db.add(doc_rec)
        self.db.commit()

        job_traversal = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key="redacted/../../../../etc/passwd"
        )
        self.db.add(job_traversal)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job_traversal.id, self.db, self.user_1)
        self.assertEqual(ctx.exception.status_code, 403)


    # -------------------------------------------------------------------------
    # Test 13: Scanned PDF with Strong OCR Yield is Enforced to REVIEW_REQUIRED
    # -------------------------------------------------------------------------
    def test_13_scanned_pdf_with_strong_ocr_yield_routes_to_review_required(self):
        """Even if OCR yield is high and strong, a scanned raster PDF cannot clear to COMPLETED."""
        img = Image.new("RGB", (600, 800), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((50, 100), "Clear Scanned Heading and Details", fill="black")
        pdf_bytes = create_scanned_pdf_from_image(img)

        key = StorageService.save_document(pdf_bytes, "scanned_strong_ocr.pdf", directory="uploads")
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="scanned_strong_ocr.pdf",
            storage_key=key,
            safety_status=SafetyStatus.UNVERIFIED,
            detected_entities=[]
        )
        self.db.add(doc_rec)
        self.db.commit()

        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.QUEUED,
            result_storage_key=None
        )
        self.db.add(job)
        self.db.commit()

        # Mock OCR output with strong confidence and high char count
        mock_stats = {
            "total_char_count": 50,
            "alphanumeric_char_count": 45,
            "word_count": 8,
            "mean_confidence": 92.0
        }
        with patch.object(OCRProcessor, "extract_blocks_with_stats", return_value=("Clear Scanned Heading", [], mock_stats)):
            result = process_redaction(job.id)

        self.db.refresh(job)
        self.db.refresh(doc_rec)

        # Enforced review gate must prevent automatic clearance
        self.assertEqual(job.status, JobStatus.REVIEW_REQUIRED)
        self.assertIsNone(job.result_storage_key)
        self.assertEqual(doc_rec.safety_status, SafetyStatus.VERIFICATION_FAILED)
        self.assertIn("Scanned/raster document requires human review", job.error_message)

        # Download endpoint must refuse artifact release with 422
        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job.id, self.db, self.user_1)
        self.assertEqual(ctx.exception.status_code, 422)

    # -------------------------------------------------------------------------
    # Test 14: Native Digital PDF Clears and Completes Successfully
    # -------------------------------------------------------------------------
    def test_14_native_digital_pdf_clears_and_downloads_successfully(self):
        """Native digital PDF with embedded text stream completes and can be downloaded."""
        pdf_bytes = create_native_pdf_from_lines(["NATIVE DIGITAL COMPLIANCE REPORT", "Section 1.1 Verified"])

        key = StorageService.save_document(pdf_bytes, "digital_report.pdf", directory="uploads")
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="digital_report.pdf",
            storage_key=key,
            safety_status=SafetyStatus.UNVERIFIED,
            detected_entities=[]
        )
        self.db.add(doc_rec)
        self.db.commit()

        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.QUEUED,
            result_storage_key=None
        )
        self.db.add(job)
        self.db.commit()

        result = process_redaction(job.id)

        self.db.refresh(job)
        self.db.refresh(doc_rec)

        self.assertEqual(job.status, JobStatus.COMPLETED)
        self.assertIsNotNone(job.result_storage_key)
        self.assertEqual(doc_rec.safety_status, SafetyStatus.VERIFIED)

        # Download must succeed with 200
        response = download_redacted_job(job.id, self.db, self.user_1)
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()

