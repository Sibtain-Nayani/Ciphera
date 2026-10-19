"""
Unit Tests for Stage 8A P2: Hyphenated SKU Verifier Boundary
Verifies that hyphenated SKUs (ABCDE1234F-01) do not trigger false PAN rejections,
while standalone genuine PANs, punctuation-adjacent PANs, and unredacted residuals
remain strictly caught.
"""

import os
import sys
import pytest
import fitz

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.schemas.document import RedactionEntity, BoundingBox
from app.services.verification_engine import VerificationEngine, VerificationFailure
from app.services.redaction_engine import SecureRedactionEngine


class TestStage8AP2SkuBoundary:

    def _create_pdf(self, text: str) -> bytes:
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text(fitz.Point(50, 100), text, fontsize=12)
        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes

    def test_p2_01_reported_hyphenated_sku_passes_verification(self):
        """Verifies that catalog SKU code ABCDE1234F-01 does not trigger false PAN rejection."""
        text = "Catalog Item Code ABCDE1234F-01 packed from Warehouse 4."
        pdf_bytes = self._create_pdf(text)
        # Empty entity list (clean document, no PII)
        # Must NOT raise VerificationFailure
        passed = VerificationEngine.verify_redacted_file(pdf_bytes, "clean_sku.pdf", [])
        assert passed is True

    def test_p2_02_prefix_hyphenated_sku_passes_verification(self):
        """Verifies that PART-ABCDE1234F does not trigger false PAN rejection."""
        text = "Replacement component PART-ABCDE1234F registered in inventory."
        pdf_bytes = self._create_pdf(text)
        passed = VerificationEngine.verify_redacted_file(pdf_bytes, "clean_sku2.pdf", [])
        assert passed is True

    def test_p2_03_embedded_pan_in_longer_alphanumeric_passes(self):
        """Verifies that ORDERABCDE1234F99 does not trigger false PAN rejection."""
        text = "Internal tracking ref ORDERABCDE1234F99 completed."
        pdf_bytes = self._create_pdf(text)
        passed = VerificationEngine.verify_redacted_file(pdf_bytes, "clean_order.pdf", [])
        assert passed is True

    def test_p2_04_standalone_genuine_pan_caught_as_leak(self):
        """Verifies that an unredacted standalone PAN is strictly caught as a leak."""
        text = "Customer Permanent Account Number: ABCDE1234F"
        pdf_bytes = self._create_pdf(text)
        with pytest.raises(VerificationFailure) as exc_info:
            VerificationEngine.verify_redacted_file(pdf_bytes, "unredacted.pdf", [])
        assert "PAN" in str(exc_info.value)

    def test_p2_05_punctuation_adjacent_pan_caught(self):
        """Verifies that a genuine PAN enclosed in parentheses or punctuation is strictly caught."""
        for text in [
            "Customer PAN: (ABCDE1234F)",
            "Record: [ABCDE1234F], status active.",
            "Permanent Account Number ABCDE1234F."
        ]:
            pdf_bytes = self._create_pdf(text)
            with pytest.raises(VerificationFailure) as exc_info:
                VerificationEngine.verify_redacted_file(pdf_bytes, "punct_pan.pdf", [])
            assert "PAN" in str(exc_info.value)

    def test_p2_06_defragmented_spaced_pan_still_caught(self):
        """Verifies that spatially fragmented PAN (A B C D E 1 2 3 4 F) is still caught by defrag layer."""
        text = "Obfuscated identifier: A B C D E 1 2 3 4 F"
        pdf_bytes = self._create_pdf(text)
        with pytest.raises(VerificationFailure) as exc_info:
            VerificationEngine.verify_redacted_file(pdf_bytes, "defrag_pan.pdf", [])
        assert "PAN" in str(exc_info.value)

    def test_p2_07_unrelated_long_numeric_not_confused_with_pan(self):
        """Verifies that an unrelated 10-to-15 digit string is not misclassified as PAN."""
        text = "Server error code 987654321012 logged at port 8080."
        pdf_bytes = self._create_pdf(text)
        # Should not trigger PAN regex leak
        try:
            VerificationEngine.verify_redacted_file(pdf_bytes, "error.pdf", [])
        except VerificationFailure as e:
            assert "PAN" not in str(e)

    def test_p2_08_hyphen_enclosed_pan_strictly_caught(self):
        """Verifies that hyphen-enclosed PANs (-ABCDE1234F-, Ref: -ABCDE1234F-) are caught as leaks."""
        for text in [
            "Customer PAN: -ABCDE1234F-",
            "Ref: -ABCDE1234F- active",
            "-ABCDE1234F",
            "ABCDE1234F-"
        ]:
            pdf_bytes = self._create_pdf(text)
            with pytest.raises(VerificationFailure) as exc_info:
                VerificationEngine.verify_redacted_file(pdf_bytes, "hyphen_pan.pdf", [])
            assert "PAN" in str(exc_info.value)

    def test_p2_09_prefix_and_suffix_sku_protection(self):
        """Verifies that compound SKUs with both prefix and suffix (SKU-ABCDE1234F-01) pass without false alarm."""
        for text in [
            "Inventory code SKU-ABCDE1234F-01 stored in Bay A.",
            "Component PART-ABCDE1234F-A verified."
        ]:
            pdf_bytes = self._create_pdf(text)
            passed = VerificationEngine.verify_redacted_file(pdf_bytes, "sku_both.pdf", [])
            assert passed is True

    def test_p2_10_alphanumeric_adjacent_tokens_pass(self):
        """Verifies that PAN-like text embedded directly in longer alphanumerics passes."""
        for text in [
            "Tracking XABCDE1234F dispatched.",
            "Order code ABCDE1234F9 completed."
        ]:
            pdf_bytes = self._create_pdf(text)
            passed = VerificationEngine.verify_redacted_file(pdf_bytes, "alnum_pan.pdf", [])
            assert passed is True

    def test_p2_11_properly_redacted_pan_passes(self):
        """Verifies that a genuine detected PAN whose redaction geometry covers the value passes verification."""
        text = "Confidential PAN: ABCDE1234F on file."
        pdf_bytes = self._create_pdf(text)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        rects = doc[0].search_for("ABCDE1234F")
        doc.close()
        assert len(rects) > 0
        r = rects[0]
        ent = RedactionEntity(
            id="ent_pan_1",
            text="ABCDE1234F",
            entity_type="PAN_NUMBER",
            page_num=1,
            bbox=BoundingBox(x0=r.x0, y0=r.y0, x1=r.x1, y1=r.y1),
            score=1.0,
            status="accepted"
        )
        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "redacted_pan.pdf", [ent])
        passed = VerificationEngine.verify_redacted_file(redacted_bytes, "redacted_pan.pdf", [ent])
        assert passed is True

    def test_p2_12_unredacted_residual_outside_redaction_geometry_caught(self):
        """Verifies that an unredacted PAN residual outside accepted redaction geometry causes verification failure."""
        text = "Primary PAN: ABCDE1234F, Secondary PAN: FGHIJ5678K."
        pdf_bytes = self._create_pdf(text)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        rects = doc[0].search_for("ABCDE1234F")
        doc.close()
        assert len(rects) > 0
        r = rects[0]
        # Only redact the primary PAN, leaving the secondary PAN unredacted
        ent = RedactionEntity(
            id="ent_pan_primary",
            text="ABCDE1234F",
            entity_type="PAN_NUMBER",
            page_num=1,
            bbox=BoundingBox(x0=r.x0, y0=r.y0, x1=r.x1, y1=r.y1),
            score=1.0,
            status="accepted"
        )
        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "partial_redacted.pdf", [ent])
        with pytest.raises(VerificationFailure) as exc_info:
            VerificationEngine.verify_redacted_file(redacted_bytes, "partial_redacted.pdf", [ent])
        assert "PAN" in str(exc_info.value)

    def test_p2_13_edge_cases_and_multi_hyphens(self):
        """Verifies multi-hyphen delimiters vs multi-hyphen SKUs and boundary variations."""
        # Hyphen delimiter cases (must be caught as leaks)
        for text in [
            "-ABCDE1234F",
            "ABCDE1234F-",
            "--ABCDE1234F--",
            "---ABCDE1234F---",
            "PAN - ABCDE1234F - active",
            "PAN:  -ABCDE1234F-  ",
        ]:
            pdf_bytes = self._create_pdf(text)
            with pytest.raises(VerificationFailure) as exc_info:
                VerificationEngine.verify_redacted_file(pdf_bytes, "hyphen_edge.pdf", [])
            assert "PAN" in str(exc_info.value)

        # Multi-hyphen compound SKU cases (must pass without false alarm)
        for text in [
            "Part PART--ABCDE1234F in stock.",
            "Serial ABCDE1234F--01 registered.",
        ]:
            pdf_bytes = self._create_pdf(text)
            passed = VerificationEngine.verify_redacted_file(pdf_bytes, "sku_multi.pdf", [])
            assert passed is True

    def test_p2_14_verification_layer_independence(self):
        """Verifies that Layer 3, Layer 3.5, and Layer 2 independently catch hyphen-enclosed PANs."""
        from unittest.mock import patch
        from app.services.verification_visual import VisualVerifier

        # Layer 3: Direct canonical text regex
        text_l3 = "Customer Record: -ABCDE1234F-"
        pdf_bytes_l3 = self._create_pdf(text_l3)
        with pytest.raises(VerificationFailure) as exc_l3:
            VerificationEngine.verify_redacted_file(pdf_bytes_l3, "l3.pdf", [])
        assert "Regex Leak: PAN_CARD" in str(exc_l3.value)

        # Layer 3.5: Defragmented spatially spaced hyphen-enclosed PAN
        text_l35 = "Obfuscated PAN: - A B C D E 1 2 3 4 F -"
        pdf_bytes_l35 = self._create_pdf(text_l35)
        with pytest.raises(VerificationFailure) as exc_l35:
            VerificationEngine.verify_redacted_file(pdf_bytes_l35, "l35.pdf", [])
        assert "PAN_CARD" in str(exc_l35.value)

        # Layer 2: Visual OCR verification with isolated OCR text
        pdf_bytes_l2 = self._create_pdf("Public Document")
        with patch("app.services.verification_visual.OCRProcessor.extract_blocks") as mock_ocr:
            mock_ocr.return_value = ("Customer PAN: -ABCDE1234F-", [])
            leaks = VisualVerifier.verify(pdf_bytes_l2, [])
            assert len(leaks) >= 1
            assert any("potential PAN structure" in l for l in leaks)

    def test_p2_15_hyphen_pan_verification_failure_blocks_artifact_acceptance(self):
        """Verifies that an unredacted hyphen-enclosed PAN halts the pipeline and blocks artifact release."""
        import uuid
        from app.models.document import Document, JobStatus, RedactionJob
        from app.models.identity import User, OrganizationMember
        from app.core.database import SessionLocal, Base, engine
        from app.services.storage import StorageService
        from app.tasks.redaction_tasks import process_redaction
        from app.api.documents import get_redaction_job_status

        Base.metadata.create_all(bind=engine)
        db = SessionLocal()

        user_id = str(uuid.uuid4())
        org_id = str(uuid.uuid4())
        user = User(id=user_id, email=f"user_{user_id[:8]}@example.com", global_role="user")
        user.org_memberships = [OrganizationMember(user_id=user_id, org_id=org_id, role="member")]

        pdf_bytes = self._create_pdf("CONFIDENTIAL TAX PAN: -ABCDE1234F-")
        storage_key = StorageService.save_document(pdf_bytes, "hyphen_pan_job.pdf", directory="uploads")
        doc_rec = Document(
            id=str(uuid.uuid4()),
            org_id=org_id,
            uploaded_by=user_id,
            filename="hyphen_pan_job.pdf",
            storage_key=storage_key,
            status=JobStatus.COMPLETED
        )
        db.add(doc_rec)
        job = RedactionJob(id=str(uuid.uuid4()), document_id=doc_rec.id, status=JobStatus.QUEUED)
        db.add(job)
        db.commit()

        # Process with no entities -> PAN remains unredacted
        process_redaction(job.id)
        db.refresh(job)

        assert job.status == JobStatus.FAILED
        assert job.result_storage_key is None
        assert "Verification failed" in str(job.error_message)

        status_resp = get_redaction_job_status(job.id, db, user)
        assert status_resp["has_artifact"] is False
        db.close()


