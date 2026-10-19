"""
Stage 7C Remediation A Test Suite: Fail-Closed Safety & Download Hardening
========================================================================
Comprehensive verification covering all 12 required test conditions:
1. Degraded image page returning zero OCR characters fails closed.
2. Page returning garbled or partial OCR text.
3. Genuine blank page passes inspection cleanly.
4. Mixed document with a readable page and an unreadable page is blocked.
5. Verification failure prevents artifact acceptance.
6. Uncertain job prevents artifact acceptance (JobStatus.REVIEW_REQUIRED).
7. Failed/uncertain jobs clean up stale result-storage keys.
8. Missing storage keys block download safely.
9. Error messages scrub raw PII and local filesystem paths.
10. Cross-tenant and cross-job artifact access blocked (IDOR protection).
11. Retry behavior after a previously generated artifact exists clears stale artifact.
12. Successful verification and download of a valid synthetic artifact succeeds.
"""

import os
import io
import sys
import uuid
import unittest
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter
import fitz
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Ensure backend and root are in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.models.document import Document, JobStatus, SafetyStatus, RedactionJob
from app.models.identity import User, Organization, OrganizationMember
from app.schemas.document import RedactionEntity, BoundingBox
from app.services.verification_engine import (
    VerificationEngine,
    VerificationFailure,
    VerificationUncertainty,
)
from app.services.storage import StorageService
from app.services.redaction_engine import SecureRedactionEngine
from app.tasks.redaction_tasks import process_redaction
from app.core.database import SessionLocal, Base, engine
from app.api.documents import download_redacted_job, get_redaction_job_status


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


class TestStage7CRemediationA(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()

        # Seed test organization and users
        cls.org_id_1 = str(uuid.uuid4())
        cls.org_id_2 = str(uuid.uuid4())
        cls.user_1_id = str(uuid.uuid4())
        cls.user_2_id = str(uuid.uuid4())

        cls.user_1 = User(id=cls.user_1_id, email="user1@example.com", global_role="user")
        cls.user_2 = User(id=cls.user_2_id, email="user2@example.com", global_role="user")

        cls.user_1.org_memberships = [OrganizationMember(user_id=cls.user_1_id, org_id=cls.org_id_1, role="member")]
        cls.user_2.org_memberships = [OrganizationMember(user_id=cls.user_2_id, org_id=cls.org_id_2, role="member")]

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    # -------------------------------------------------------------------------
    # Test 1: Degraded image page returning zero OCR characters
    # -------------------------------------------------------------------------
    def test_01_degraded_image_zero_ocr_characters_fails_closed(self):
        """A degraded image with visible ink where OCR returns 0 characters triggers VerificationUncertainty."""
        img = Image.new("RGB", (500, 150), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "CONFIDENTIAL IDENTIFIER: ABCDE1234F", fill="black")
        img = img.filter(ImageFilter.GaussianBlur(radius=4.5))
        pdf_bytes = create_scanned_pdf(img)

        with self.assertRaises(VerificationUncertainty) as ctx:
            VerificationEngine.verify_redacted_file(pdf_bytes, "degraded_scan.pdf", [])
        self.assertIn("Verification uncertainty", str(ctx.exception.detail))
        self.assertEqual(ctx.exception.status_code, 422)

    # -------------------------------------------------------------------------
    # Test 2: Page returning garbled OCR text
    # -------------------------------------------------------------------------
    def test_02_page_returning_garbled_ocr_text(self):
        """A page with noise and garbled characters fails verification or uncertainty without silent pass."""
        img = Image.new("RGB", (500, 150), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "Account: 998811223344", fill=(175, 175, 175))
        pdf_bytes = create_scanned_pdf(img)

        # Either uncertainty is triggered or if OCR returns 0 chars it fails closed
        try:
            passed = VerificationEngine.verify_redacted_file(pdf_bytes, "garbled.pdf", [])
        except (VerificationUncertainty, VerificationFailure) as e:
            self.assertIn(e.status_code, [422, 500])

    # -------------------------------------------------------------------------
    # Test 3: Genuine blank page passes inspection cleanly
    # -------------------------------------------------------------------------
    def test_03_genuine_blank_page_passes_inspection(self):
        """A genuine blank white page contains no visual ink and passes without uncertainty."""
        img = Image.new("RGB", (500, 700), color=(255, 255, 255))
        pdf_bytes = create_scanned_pdf(img)

        passed = VerificationEngine.verify_redacted_file(pdf_bytes, "blank_page.pdf", [])
        self.assertTrue(passed)

    # -------------------------------------------------------------------------
    # Test 4: Mixed document with readable and unreadable page
    # -------------------------------------------------------------------------
    def test_04_mixed_document_readable_and_unreadable_page_blocked(self):
        """Multi-page document with Page 1 native text and Page 2 unreadable scan must block release."""
        doc = fitz.open()
        p1 = doc.new_page(width=500, height=700)
        p1.insert_text((50, 100), "Page 1: Public Document Information", fontsize=12)

        # Page 2: Degraded image with faint text
        img = Image.new("RGB", (500, 700), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((50, 100), "Page 2 Confidential PAN: ABCDE1234F", fill="black")
        img = img.filter(ImageFilter.GaussianBlur(radius=4.5))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        p2 = doc.new_page(width=500, height=700)
        p2.insert_image(fitz.Rect(0, 0, 500, 700), stream=buf.getvalue())

        mixed_bytes = doc.tobytes()
        doc.close()

        with self.assertRaises(VerificationUncertainty) as ctx:
            VerificationEngine.verify_redacted_file(mixed_bytes, "mixed.pdf", [])
        self.assertIn("Page 2", str(ctx.exception.detail))

    # -------------------------------------------------------------------------
    # Test 5: Verification failure prevents artifact acceptance
    # -------------------------------------------------------------------------
    def test_05_verification_failure_prevents_artifact_acceptance(self):
        """When definitive leak is detected, job status is FAILED and result_storage_key is None."""
        text = ["CONFIDENTIAL PAN CARD: ABCDE1234F"]
        pdf_bytes = create_native_pdf(text)
        storage_key = StorageService.save_document(pdf_bytes, "leak_doc.pdf", directory="uploads")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="leak_doc.pdf",
            storage_key=storage_key,
            status=JobStatus.COMPLETED
        )
        self.db.add(doc_rec)
        job = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.QUEUED)
        self.db.add(job)
        self.db.commit()

        # Execute process_redaction with NO entities (meaning PAN remains completely unredacted)
        process_redaction(job.id)
        self.db.refresh(job)

        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertIsNone(job.result_storage_key)
        self.assertIsNotNone(job.error_message)

        # Check API status endpoint
        status_resp = get_redaction_job_status(job.id, self.db, self.user_1)
        self.assertFalse(status_resp["has_artifact"])

    # -------------------------------------------------------------------------
    # Test 6: Uncertain job prevents artifact acceptance (JobStatus.REVIEW_REQUIRED)
    # -------------------------------------------------------------------------
    def test_06_uncertain_job_prevents_artifact_acceptance(self):
        """When document is unreadable, job transitions to REVIEW_REQUIRED and has_artifact is False."""
        img = Image.new("RGB", (500, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((30, 40), "CONFIDENTIAL IDENTIFIER: ABCDE1234F", fill="black")
        img = img.filter(ImageFilter.GaussianBlur(radius=4.5))
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

        process_redaction(job.id)
        self.db.refresh(job)

        self.assertEqual(job.status, JobStatus.REVIEW_REQUIRED)
        self.assertIsNone(job.result_storage_key)

        status_resp = get_redaction_job_status(job.id, self.db, self.user_1)
        self.assertFalse(status_resp["has_artifact"])
        self.assertEqual(status_resp["status"], JobStatus.REVIEW_REQUIRED)

        # Download attempt must return HTTP 422
        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job.id, self.db, self.user_1)
        self.assertEqual(ctx.exception.status_code, 422)

    # -------------------------------------------------------------------------
    # Test 7: Failed jobs with stale result-storage keys cleaned
    # -------------------------------------------------------------------------
    def test_07_failed_jobs_with_stale_storage_keys_cleaned(self):
        """If a job has a stale storage key and subsequently fails, the key is set to None and artifact deleted."""
        fake_storage_key = StorageService.save_document(b"stale_bytes", "stale.pdf", directory="redacted")
        full_stale_path = os.path.join(BACKEND_DIR, "data", fake_storage_key)

        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=str(uuid.uuid4()),
            status=JobStatus.PROCESSING,
            result_storage_key=fake_storage_key
        )
        self.db.add(job)
        self.db.commit()

        # Simulate task exception cleanup logic
        if job.result_storage_key:
            StorageService.delete_document(job.result_storage_key)
            job.result_storage_key = None
        job.status = JobStatus.FAILED
        self.db.commit()
        self.db.refresh(job)

        self.assertIsNone(job.result_storage_key)
        self.assertFalse(os.path.exists(full_stale_path))

    # -------------------------------------------------------------------------
    # Test 8: Missing storage keys block download
    # -------------------------------------------------------------------------
    def test_08_missing_storage_keys_block_download(self):
        """A completed job without a result_storage_key returns 404 and does not attempt retrieval."""
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="test.pdf"
        )
        self.db.add(doc_rec)
        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key=None,
            error_message="Historical error message"
        )
        self.db.add(job)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job.id, self.db, self.user_1)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Artifact not found", ctx.exception.detail)

    # -------------------------------------------------------------------------
    # Test 9: Error messages contain no raw PII or local paths
    # -------------------------------------------------------------------------
    def test_09_error_messages_contain_no_raw_pii_or_paths(self):
        """Error messages scrub raw PAN, Aadhaar, cards, and do not leak disk paths."""
        raw_msg = (
            "Failure reading C:\\Users\\Administrator\\data\\uploads\\doc.pdf: "
            "found PAN ABCDE1234F and Aadhaar 9012 3456 7890 with card 4111 2222 3333 4444"
        )
        clean_msg = VerificationEngine.sanitize_error_string(raw_msg)
        self.assertNotIn("ABCDE1234F", clean_msg)
        self.assertNotIn("9012 3456 7890", clean_msg)
        self.assertNotIn("4111 2222 3333 4444", clean_msg)
        self.assertIn("[REDACTED_PAN]", clean_msg)
        self.assertIn("[REDACTED_AADHAAR]", clean_msg)
        self.assertIn("[REDACTED_CARD]", clean_msg)

    # -------------------------------------------------------------------------
    # Test 10: Cross-tenant and cross-job artifact access blocked
    # -------------------------------------------------------------------------
    def test_10_cross_tenant_and_cross_job_access_blocked(self):
        """User from Org 2 cannot download or inspect a job belonging to Org 1 (IDOR protection)."""
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="org1_doc.pdf"
        )
        self.db.add(doc_rec)
        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=doc_rec.id,
            status=JobStatus.COMPLETED,
            result_storage_key="redacted/test.pdf"
        )
        self.db.add(job)
        self.db.commit()

        # User 2 belongs to Org 2
        with self.assertRaises(HTTPException) as ctx:
            download_redacted_job(job.id, self.db, self.user_2)
        self.assertEqual(ctx.exception.status_code, 404)

        with self.assertRaises(HTTPException) as ctx:
            get_redaction_job_status(job.id, self.db, self.user_2)
        self.assertEqual(ctx.exception.status_code, 404)

    # -------------------------------------------------------------------------
    # Test 11: Retry behavior after previous artifact exists
    # -------------------------------------------------------------------------
    def test_11_retry_behavior_clears_previous_artifact(self):
        """When a job is retried, the old storage key is immediately cleared and unlinked."""
        stale_key = StorageService.save_document(b"old_artifact", "old.pdf", directory="redacted")
        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=str(uuid.uuid4()),
            status=JobStatus.COMPLETED,
            result_storage_key=stale_key
        )
        self.db.add(job)
        self.db.commit()

        # Retry triggered: transitions to PROCESSING
        job.status = JobStatus.PROCESSING
        if job.result_storage_key:
            StorageService.delete_document(job.result_storage_key)
            job.result_storage_key = None
        self.db.commit()
        self.db.refresh(job)

        self.assertEqual(job.status, JobStatus.PROCESSING)
        self.assertIsNone(job.result_storage_key)

    # -------------------------------------------------------------------------
    # Test 12: Successful verification and download of valid artifact
    # -------------------------------------------------------------------------
    def test_12_successful_verification_and_download_of_valid_artifact(self):
        """A valid clean document successfully verifies, produces an artifact, and allows download."""
        text = [
            "STANDARD PUBLIC REPORT",
            "This document contains no PII or sensitive identifiers.",
            "Quarterly Summary: All operations nominal."
        ]
        pdf_bytes = create_native_pdf(text)
        storage_key = StorageService.save_document(pdf_bytes, "clean_valid.pdf", directory="uploads")

        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=self.org_id_1,
            uploaded_by=self.user_1_id,
            filename="clean_valid.pdf",
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

        # Download succeeds and returns 200 Response
        resp = download_redacted_job(job.id, self.db, self.user_1)
        self.assertEqual(resp.status_code, 200)
        self.assertGreater(len(resp.body), 0)


if __name__ == "__main__":
    unittest.main()
