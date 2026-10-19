"""
Stage 7C Remediation B Test Suite: Multi-Signal OCR Uncertainty & State Refinement
================================================================================
Comprehensive verification covering all 13 required test cases:
1. Zero-character OCR output on degraded visual scan.
2. Small nonzero OCR output (1-3 junk tokens / negligible alphanumeric yield).
3. Garbled output with high character count (predominantly non-alphanumeric noise).
4. Missing confidence metadata fallback (graceful degradation without crash).
5. OCR exceptions / incomplete page processing trapped as uncertainty.
6. Mixed readable and unreadable multi-page documents block artifact release.
7. Blank page handling (passes cleanly without false alarm).
8. Confirmed residual PII leaks fail with VerificationFailure (500) and FAILED.
9. Uncertain jobs set REVIEW_REQUIRED, clear result_storage_key, sanitize error.
10. Retry after a previously generated artifact was created deletes stale artifact.
11. Download attempts for failed (400), review-required (422), missing key (404).
12. Path traversal, canonical containment (403), and cross-tenant access (404).
13. Successful processing of a readable synthetic document (COMPLETED, 200).
"""

import os
import io
import sys
import uuid
import unittest
from unittest.mock import patch
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter
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
from app.schemas.document import RedactionEntity, CanonicalBlock, BoundingBox
from app.services.verification_engine import (
    VerificationEngine,
    VerificationFailure,
    VerificationUncertainty,
)
from app.services.storage import StorageService
from app.services.ocr import OCRProcessor
from app.tasks.redaction_tasks import process_redaction
from app.core.database import SessionLocal, Base, engine
from app.api.documents import download_redacted_job, get_redaction_job_status
from app.core.config import settings


def create_scanned_pdf(img: Image.Image) -> bytes:
    """Converts a PIL Image to a single-page scanned PDF."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    doc = fitz.open()
    page = doc.new_page(width=img.width, height=img.height)
    page.insert_image(fitz.Rect(0, 0, img.width, img.height), stream=buf.getvalue())
    b = doc.tobytes()
    doc.close()
    return b


def create_native_pdf(lines: list) -> bytes:
    """Creates a native PDF with embedded digital text."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 100
    for line in lines:
        page.insert_text((50, y), line, fontsize=11, fontname="helv")
        y += 25
    b = doc.tobytes()
    doc.close()
    return b


class TestStage7CRemediationB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()

        # Seed test organizations and users
        cls.org_id_1 = str(uuid.uuid4())
        cls.org_id_2 = str(uuid.uuid4())
        cls.user_1_id = str(uuid.uuid4())
        cls.user_2_id = str(uuid.uuid4())

        cls.user_1 = User(id=cls.user_1_id, email="tenant1@example.com", global_role="user")
        cls.user_2 = User(id=cls.user_2_id, email="tenant2@example.com", global_role="user")

        cls.user_1.org_memberships = [OrganizationMember(user_id=cls.user_1_id, org_id=cls.org_id_1, role="member")]
        cls.user_2.org_memberships = [OrganizationMember(user_id=cls.user_2_id, org_id=cls.org_id_2, role="member")]

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    # -------------------------------------------------------------------------
    # Test 1: Zero-character OCR output
    # -------------------------------------------------------------------------
    def test_01_zero_character_ocr_output(self):
        """Degraded image page with visual ink returning zero OCR characters triggers VerificationUncertainty."""
        img = Image.new("RGB", (500, 150), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "SECRET IDENTIFIER: ABCDE1234F", fill="black")
        img = img.filter(ImageFilter.GaussianBlur(radius=5.0))
        pdf_bytes = create_scanned_pdf(img)

        # Mock OCRProcessor returning 0 alphanumeric characters
        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            mock_ocr.return_value = ("", [], {
                "word_count": 0,
                "confidences": [],
                "mean_confidence": None,
                "alphanumeric_char_count": 0,
                "total_char_count": 0,
                "raw_text": "",
            })
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "zero_char.pdf", [])
            self.assertEqual(ctx.exception.status_code, 422)
            self.assertIn("zero alphanumeric characters", str(ctx.exception.detail))

    # -------------------------------------------------------------------------
    # Test 2: Small nonzero OCR output (e.g. 1-3 junk tokens)
    # -------------------------------------------------------------------------
    def test_02_small_nonzero_ocr_output(self):
        """Degraded scan with visual ink returning small/garbage characters (e.g. 2 chars) fails closed."""
        img = Image.new("RGB", (500, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "Confidential ID: 1234 5678 9012", fill="black")
        pdf_bytes = create_scanned_pdf(img)

        # Mock OCR returning only 2 alphanumeric characters on a page with visual ink
        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            mock_ocr.return_value = ("? 23", [
                CanonicalBlock(page_num=1, text="?", bbox=BoundingBox(x0=10, y0=10, x1=20, y1=20), block_type="text", start_index=0, end_index=1),
                CanonicalBlock(page_num=1, text="23", bbox=BoundingBox(x0=30, y0=10, x1=50, y1=20), block_type="text", start_index=2, end_index=4),
            ], {
                "word_count": 2,
                "confidences": [30.0, 35.0],
                "mean_confidence": 32.5,
                "alphanumeric_char_count": 2,
                "total_char_count": 4,
                "raw_text": "? 23",
            })
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "small_nonzero.pdf", [])
            self.assertEqual(ctx.exception.status_code, 422)
            self.assertIn("Negligible OCR yield", str(ctx.exception.detail))

    # -------------------------------------------------------------------------
    # Test 3: Garbled output with high character count (predominantly non-alnum)
    # -------------------------------------------------------------------------
    def test_03_garbled_output_predominantly_non_alphanumeric_noise(self):
        """Noisy scan producing predominantly punctuation and symbols triggers uncertainty."""
        img = Image.new("RGB", (500, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "PAN: ABCDE1234F", fill="black")
        pdf_bytes = create_scanned_pdf(img)

        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            mock_ocr.return_value = (";;;;; ::: === +++ ~~~ a", [], {
                "word_count": 6,
                "confidences": [25.0, 30.0],
                "mean_confidence": 27.5,
                "alphanumeric_char_count": 1,
                "total_char_count": 24,
                "raw_text": ";;;;; ::: === +++ ~~~ a",
            })
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "garbled_noise.pdf", [])
            self.assertEqual(ctx.exception.status_code, 422)

    # -------------------------------------------------------------------------
    # Test 4: Missing confidence metadata fallback
    # -------------------------------------------------------------------------
    def test_04_missing_confidence_metadata_fallback(self):
        """OCR output with mean_confidence=None degrades gracefully without raising TypeError."""
        # 4a: Readable text with missing confidence passes cleanly
        img = Image.new("RGB", (500, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "Public unclassified invoice header line 102", fill="black")
        pdf_bytes = create_scanned_pdf(img)

        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            mock_ocr.return_value = ("Public unclassified invoice header line 102", [], {
                "word_count": 6,
                "confidences": [],
                "mean_confidence": None,
                "alphanumeric_char_count": 38,
                "total_char_count": 43,
                "raw_text": "Public unclassified invoice header line 102",
            })
            # Mock parsing so regex check sees clean text
            with patch("app.services.document_parser.DocumentParser.parse") as mock_parse:
                from app.schemas.document import CanonicalDocument
                mock_parse.return_value = CanonicalDocument(
                    document_id="doc1",
                    filename="readable.pdf",
                    page_count=1,
                    full_text="Public unclassified invoice header line 102",
                    blocks=[],
                    metadata={}
                )
                passed = VerificationEngine.verify_redacted_file(pdf_bytes, "readable.pdf", [])
                self.assertTrue(passed)

        # 4b: Degraded text with missing confidence and negligible yield triggers uncertainty
        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            mock_ocr.return_value = ("a", [], {
                "word_count": 1,
                "confidences": [],
                "mean_confidence": None,
                "alphanumeric_char_count": 1,
                "total_char_count": 1,
                "raw_text": "a",
            })
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "low_yield_noconf.pdf", [])
            self.assertEqual(ctx.exception.status_code, 422)

    # -------------------------------------------------------------------------
    # Test 5: OCR exceptions / incomplete page processing
    # -------------------------------------------------------------------------
    def test_05_ocr_exceptions_caught_and_routed_to_uncertainty(self):
        """An unhandled OCR exception is caught and routed to VerificationUncertainty instead of crashing."""
        img = Image.new("RGB", (500, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "Visual Document Page", fill="black")
        pdf_bytes = create_scanned_pdf(img)

        with patch.object(OCRProcessor, "extract_blocks_with_stats", side_effect=RuntimeError("Tesseract OCR timeout")):
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(pdf_bytes, "ocr_error.pdf", [])
            self.assertEqual(ctx.exception.status_code, 422)
            self.assertIn("OCR extraction engine error", str(ctx.exception.detail))

    # -------------------------------------------------------------------------
    # Test 6: Mixed readable and unreadable multi-page documents
    # -------------------------------------------------------------------------
    def test_06_mixed_readable_and_unreadable_multipage_document_fails_closed(self):
        """Multi-page document where Page 1 is readable and Page 2 is unreadable blocks release."""
        doc = fitz.open()
        p1 = doc.new_page(width=500, height=700)
        p1.insert_text((50, 100), "Page 1: Clear Readable Company Introduction", fontsize=12)

        img = Image.new("RGB", (500, 700), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((50, 100), "Page 2 Unreadable Scanned Details", fill="black")
        img = img.filter(ImageFilter.GaussianBlur(radius=5.0))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        p2 = doc.new_page(width=500, height=700)
        p2.insert_image(fitz.Rect(0, 0, 500, 700), stream=buf.getvalue())

        mixed_bytes = doc.tobytes()
        doc.close()

        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            # Page 2 OCR returns 0 chars
            mock_ocr.return_value = ("", [], {
                "word_count": 0,
                "confidences": [],
                "mean_confidence": None,
                "alphanumeric_char_count": 0,
                "total_char_count": 0,
                "raw_text": "",
            })
            with self.assertRaises(VerificationUncertainty) as ctx:
                VerificationEngine.verify_redacted_file(mixed_bytes, "multipage_mixed.pdf", [])
            self.assertEqual(ctx.exception.status_code, 422)
            self.assertIn("Page 2", str(ctx.exception.detail))

    # -------------------------------------------------------------------------
    # Test 7: Blank page handling
    # -------------------------------------------------------------------------
    def test_07_genuine_blank_page_passes_cleanly(self):
        """A genuinely blank white page contains no visual ink and passes cleanly without false alarm."""
        img = Image.new("RGB", (500, 700), color=(255, 255, 255))
        pdf_bytes = create_scanned_pdf(img)

        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            mock_ocr.return_value = ("", [], {
                "word_count": 0,
                "confidences": [],
                "mean_confidence": None,
                "alphanumeric_char_count": 0,
                "total_char_count": 0,
                "raw_text": "",
            })
            passed = VerificationEngine.verify_redacted_file(pdf_bytes, "blank_page.pdf", [])
            self.assertTrue(passed)

    # -------------------------------------------------------------------------
    # Test 8: Confirmed residual PII leaks fail with VerificationFailure (500)
    # -------------------------------------------------------------------------
    def test_08_confirmed_residual_pii_leak_triggers_verification_failure(self):
        """Definitive residual PII triggers VerificationFailure (HTTP 500) and marks job FAILED."""
        text = ["CONFIDENTIAL EMPLOYEE PAN: ABCDE1234F"]
        pdf_bytes = create_native_pdf(text)
        storage_key = StorageService.save_document(pdf_bytes, "pii_leak.pdf", directory="uploads")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="pii_leak.pdf",
            storage_key=storage_key,
            status=JobStatus.COMPLETED
        )
        self.db.add(doc_rec)
        job = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.QUEUED)
        self.db.add(job)
        self.db.commit()

        # Execute process_redaction with no entities so PAN leaks
        process_redaction(job.id)
        self.db.refresh(job)

        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertIsNone(job.result_storage_key)
        self.assertIn("Verification failed", job.error_message)
        self.db.refresh(doc_rec)
        self.assertEqual(doc_rec.safety_status, SafetyStatus.VERIFICATION_FAILED)

    # -------------------------------------------------------------------------
    # Test 9: Uncertain jobs set REVIEW_REQUIRED and clear artifact
    # -------------------------------------------------------------------------
    def test_09_uncertain_job_and_artifact_rejection(self):
        """When uncertainty triggers in Celery task, job is REVIEW_REQUIRED and has_artifact is False."""
        img = Image.new("RGB", (500, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "FAINT AADHAAR: 1234 5678 9012", fill="black")
        img = img.filter(ImageFilter.GaussianBlur(radius=5.0))
        pdf_bytes = create_scanned_pdf(img)
        storage_key = StorageService.save_document(pdf_bytes, "uncertain_scan.pdf", directory="uploads")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="uncertain_scan.pdf",
            storage_key=storage_key,
            status=JobStatus.COMPLETED
        )
        self.db.add(doc_rec)
        job = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.QUEUED)
        self.db.add(job)
        self.db.commit()

        with patch.object(OCRProcessor, "extract_blocks_with_stats") as mock_ocr:
            mock_ocr.return_value = ("", [], {
                "word_count": 0,
                "confidences": [],
                "mean_confidence": None,
                "alphanumeric_char_count": 0,
                "total_char_count": 0,
                "raw_text": "",
            })
            process_redaction(job.id)

        self.db.refresh(job)
        self.assertEqual(job.status, JobStatus.REVIEW_REQUIRED)
        self.assertIsNone(job.result_storage_key)
        self.assertIn("Verification uncertainty", job.error_message)

        # Check API status
        status_resp = get_redaction_job_status(job.id, self.db, self.user_1)
        self.assertFalse(status_resp["has_artifact"])
        self.assertEqual(status_resp["status"], JobStatus.REVIEW_REQUIRED)

    # -------------------------------------------------------------------------
    # Test 10: Retry cleans up stale artifact before re-execution
    # -------------------------------------------------------------------------
    def test_10_retry_cleans_up_stale_artifact_before_reexecution(self):
        """When an existing job is retried, the prior result_storage_key is deleted from disk."""
        stale_key = StorageService.save_document(b"prior_redacted_data", "prior.pdf", directory="redacted")
        full_stale_path = os.path.join(settings.LOCAL_STORAGE_DIR, stale_key)
        self.assertTrue(os.path.exists(full_stale_path))

        # Create a document and job with the prior artifact key
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="retry_doc.pdf",
            storage_key="uploads/dummy.pdf"
        )
        self.db.add(doc_rec)
        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.QUEUED,
            result_storage_key=stale_key
        )
        self.db.add(job)
        self.db.commit()

        # Mock StorageService.get_document to throw an error during retry
        with patch.object(StorageService, "get_document", side_effect=Exception("Storage failure")):
            process_redaction(job.id)

        self.db.refresh(job)
        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertIsNone(job.result_storage_key)
        self.assertFalse(os.path.exists(full_stale_path))

    # -------------------------------------------------------------------------
    # Test 11: Download attempts for failed and review-required jobs
    # -------------------------------------------------------------------------
    def test_11_download_attempts_for_non_completed_and_uncertain_jobs(self):
        """Download endpoint enforces: 422 for REVIEW_REQUIRED, 400 for FAILED, 404 for missing key."""
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="endpoint_tests.pdf"
        )
        self.db.add(doc_rec)

        # 11a: REVIEW_REQUIRED -> 422
        job_review = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.REVIEW_REQUIRED,
            result_storage_key=None
        )
        self.db.add(job_review)

        # 11b: FAILED -> 400
        job_failed = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.FAILED,
            result_storage_key=None
        )
        self.db.add(job_failed)

        # 11c: COMPLETED but missing key -> 404
        job_missing_key = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key=None
        )
        self.db.add(job_missing_key)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx1:
            download_redacted_job(job_review.id, self.db, self.user_1)
        self.assertEqual(ctx1.exception.status_code, 422)

        with self.assertRaises(HTTPException) as ctx2:
            download_redacted_job(job_failed.id, self.db, self.user_1)
        self.assertEqual(ctx2.exception.status_code, 400)

        with self.assertRaises(HTTPException) as ctx3:
            download_redacted_job(job_missing_key.id, self.db, self.user_1)
        self.assertEqual(ctx3.exception.status_code, 404)

    # -------------------------------------------------------------------------
    # Test 12: Canonical path containment and cross-tenant access
    # -------------------------------------------------------------------------
    def test_12_canonical_path_containment_and_idor_protection(self):
        """Path traversal is blocked with 403, and cross-tenant access is blocked with 404."""
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="security_doc.pdf"
        )
        self.db.add(doc_rec)

        # Job with malicious path traversal in result_storage_key
        job_traversal = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key="redacted/../../sensitive_passwords.txt"
        )
        self.db.add(job_traversal)

        # Job in non-redacted directory
        job_wrong_dir = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key="uploads/sensitive_raw_upload.pdf"
        )
        self.db.add(job_wrong_dir)
        self.db.commit()

        # Path traversal -> 403
        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job_traversal.id, self.db, self.user_1)
        self.assertEqual(ctx.exception.status_code, 403)

        # Wrong directory -> 403
        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job_wrong_dir.id, self.db, self.user_1)
        self.assertEqual(ctx.exception.status_code, 403)

        # Cross-tenant IDOR access -> 404
        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job_traversal.id, self.db, self.user_2)
        self.assertEqual(ctx.exception.status_code, 404)

    # -------------------------------------------------------------------------
    # Test 13: Successful processing of readable synthetic document
    # -------------------------------------------------------------------------
    def test_13_successful_processing_of_readable_synthetic_document(self):
        """A valid readable document with no residual PII completes successfully and downloads."""
        text = [
            "STANDARD COMPLIANCE REPORT",
            "Organization: Global Services Corp",
            "This report contains verified public metadata."
        ]
        pdf_bytes = create_native_pdf(text)
        storage_key = StorageService.save_document(pdf_bytes, "valid_clean.pdf", directory="uploads")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="valid_clean.pdf",
            storage_key=storage_key,
            status=JobStatus.COMPLETED
        )
        self.db.add(doc_rec)
        job = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.QUEUED)
        self.db.add(job)
        self.db.commit()

        process_redaction(job.id)
        self.db.refresh(job)

        self.assertEqual(job.status, JobStatus.COMPLETED)
        self.assertIsNotNone(job.result_storage_key)
        self.assertTrue(job.result_storage_key.startswith("redacted/"))

        # Download artifact returns HTTP 200 Response
        resp = download_redacted_job(job.id, self.db, self.user_1)
        self.assertEqual(resp.status_code, 200)
        self.assertGreater(len(resp.body), 0)


if __name__ == "__main__":
    unittest.main()
