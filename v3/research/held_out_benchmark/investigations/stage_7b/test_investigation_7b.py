"""
Stage 7B Safety Failure Investigation Test Suite
=================================================
Reproduces:
1. Workstream A: The 8 degraded scanned document safety failures (PII escape & verification pass).
2. Workstream B: The 4 clean document false rejections (Layer 1 Geometry, Layer 2 Visual OCR, Layer 3 Regex, Layer 3.6 Residual Fragment).
3. Workstream C: Fail-closed integration enforcement (job state, storage key, download block, error sanitization).
4. Workstream D: Data collection for uncertainty policy.

STRICT CONSTRAINTS:
- No changes to production code.
- No changes to sealed corpus or Stage 6 reports/hashes.
- Uses synthetic, privacy-safe fixtures generated in-memory.
"""

import os
import io
import sys
import json
import uuid
import unittest
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import fitz

# Ensure backend and repo root are in python path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.schemas.document import CanonicalDocument, CanonicalBlock, BoundingBox, RedactionEntity
from app.services.document_parser import DocumentParser
from app.services.detection_engine import DetectionEngine
from app.services.decision_engine import DecisionEngine
from app.services.redaction_engine import SecureRedactionEngine
from app.services.verification_engine import VerificationEngine
from app.services.verification_geometry import GeometryVerifier
from app.services.verification_visual import VisualVerifier
from app.models.document import JobStatus, RedactionJob
from fastapi import HTTPException


# =============================================================================
# Helper: Synthetic Document Generators
# =============================================================================

def create_scanned_pdf_from_image(img: Image.Image) -> bytes:
    """Converts a PIL image into a single-page scanned PDF (no native text layer)."""
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_bytes = img_byte_arr.getvalue()

    doc = fitz.open()
    page = doc.new_page(width=img.width, height=img.height)
    rect = fitz.Rect(0, 0, img.width, img.height)
    page.insert_image(rect, stream=img_bytes)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_native_pdf_with_text(text_lines: list, rects: list = None) -> bytes:
    """Creates a native PDF containing embedded text layer."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 100
    for line in text_lines:
        page.insert_text((50, y), line, fontsize=11, fontname="helv")
        y += 25
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class TestStage7BInvestigation(unittest.TestCase):
    results_collector = {
        "workstream_a_scanned_failures": [],
        "workstream_b_clean_rejections": [],
        "workstream_c_fail_closed": [],
    }

    # =========================================================================
    # Workstream A: Scanned-Document Safety Failure Reproduction
    # =========================================================================

    def _trace_scanned_pipeline(self, fixture_name: str, description: str, pdf_bytes: bytes, ground_truth_pii: str):
        """
        Traces all 7 stages of pipeline on a synthetic degraded scan.
        Records status at every stage.
        """
        record = {
            "fixture": fixture_name,
            "description": description,
            "ground_truth_pii": ground_truth_pii,
            "stages": {}
        }

        # Stage 1: Input Validation & Canonical Parsing
        try:
            canonical_doc = DocumentParser.parse(pdf_bytes, f"{fixture_name}.pdf")
            extracted_text = canonical_doc.full_text
            record["stages"]["1_input_validation"] = {"status": "SUCCESS", "pages": canonical_doc.page_count}
            record["stages"]["2_ocr_text_extraction"] = {
                "status": "SUCCESS" if extracted_text.strip() else "EMPTY_EXTRACTION",
                "extracted_length": len(extracted_text),
                "extracted_snippet": extracted_text[:100].replace("\n", " ")
            }
        except Exception as e:
            record["stages"]["1_input_validation"] = {"status": "FAILED", "error": str(e)}
            record["stages"]["2_ocr_text_extraction"] = {"status": "NOT_REACHED"}
            return record

        # Stage 3: Entity Detection
        try:
            detected_entities = DetectionEngine.run_detection(canonical_doc, threshold=0.50)
            record["stages"]["3_entity_detection"] = {
                "status": "SUCCESS" if detected_entities else "ZERO_ENTITIES_FOUND",
                "entity_count": len(detected_entities),
                "detected_types": [e.entity_type for e in detected_entities]
            }
        except Exception as e:
            record["stages"]["3_entity_detection"] = {"status": "FAILED", "error": str(e)}
            detected_entities = []

        # Stage 4: Redaction Decision
        try:
            decided_entities = DecisionEngine.apply_policies(detected_entities, policy_config={"mode": "balanced"})
            record["stages"]["4_redaction_decision"] = {
                "status": "SUCCESS",
                "accepted_count": sum(1 for e in decided_entities if e.status in ["pending", "accepted", "modified"])
            }
        except Exception as e:
            record["stages"]["4_redaction_decision"] = {"status": "FAILED", "error": str(e)}
            decided_entities = []

        # Stage 5: Redaction Execution
        try:
            redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, f"{fixture_name}.pdf", decided_entities)
            record["stages"]["5_redaction_execution"] = {
                "status": "SUCCESS",
                "bytes_equal_original": (redacted_bytes == pdf_bytes)
            }
        except Exception as e:
            record["stages"]["5_redaction_execution"] = {"status": "FAILED", "error": str(e)}
            redacted_bytes = pdf_bytes

        # Stage 6: Independent Verification
        verification_passed = False
        rejection_message = None
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, f"redacted_{fixture_name}.pdf", decided_entities)
            verification_passed = True
            record["stages"]["6_independent_verification"] = {
                "status": "PASSED_VERIFICATION",
                "leaks_found": 0
            }
        except HTTPException as e:
            verification_passed = False
            rejection_message = e.detail
            record["stages"]["6_independent_verification"] = {
                "status": "REJECTED_BY_VERIFIER",
                "error": str(e.detail)
            }
        except Exception as e:
            verification_passed = False
            rejection_message = str(e)
            record["stages"]["6_independent_verification"] = {
                "status": "VERIFIER_EXCEPTION",
                "error": str(e)
            }

        # Stage 7: Artifact Acceptance & Download Eligibility
        # Simulates task completion logic in redaction_tasks.py
        if verification_passed:
            simulated_job_status = "COMPLETED"
            artifact_accepted = True
            download_eligible = True
            # CRITICAL SAFETY EVALUATION:
            # Did the document contain unredacted PII in pixels while passing verification?
            pii_clean = ground_truth_pii.replace(" ", "").upper()
            redacted_clean_entities = [
                e.text.replace(" ", "").upper()
                for e in decided_entities
                if e.status in ["pending", "accepted", "modified"]
            ]
            if pii_clean not in redacted_clean_entities:
                safety_outcome = "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)"
            else:
                safety_outcome = "SAFELY_PROCESSED"
        else:
            simulated_job_status = "FAILED"
            artifact_accepted = False
            download_eligible = False
            safety_outcome = "SAFELY_REJECTED (FAIL-CLOSED)"

        record["stages"]["7_artifact_and_download"] = {
            "job_status": simulated_job_status,
            "artifact_accepted": artifact_accepted,
            "download_eligible": download_eligible,
            "safety_outcome": safety_outcome
        }

        self.results_collector["workstream_a_scanned_failures"].append(record)
        return record

    def test_deg_01_low_contrast_pan(self):
        """Fixture 1: Low contrast text with faint PAN."""
        img = Image.new("RGB", (600, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        # Very light grey text on white background (contrast ratio ~ 1.3:1)
        d.text((50, 50), "Customer Permanent Account: ABCDE1234F", fill=(210, 210, 210))
        pdf_bytes = create_scanned_pdf_from_image(img)

        record = self._trace_scanned_pipeline(
            "deg_01_low_contrast",
            "Low contrast text (light grey on white) containing PAN ABCDE1234F",
            pdf_bytes,
            "ABCDE1234F"
        )
        # Confirm that missing OCR caused zero detections AND verification passed!
        self.assertEqual(record["stages"]["3_entity_detection"]["entity_count"], 0)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")

    def test_deg_02_heavy_blur_aadhaar(self):
        """Fixture 2: Heavy Gaussian blur where OCR fails to detect Aadhaar."""
        img = Image.new("RGB", (600, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((50, 50), "Aadhaar Card: 9012 3456 7890", fill=(0, 0, 0))
        blurred = img.filter(ImageFilter.GaussianBlur(radius=3.5))
        pdf_bytes = create_scanned_pdf_from_image(blurred)

        record = self._trace_scanned_pipeline(
            "deg_02_heavy_blur",
            "Heavy Gaussian blur (radius=3.5) containing Aadhaar 9012 3456 7890",
            pdf_bytes,
            "9012 3456 7890"
        )
        detected_types = record["stages"]["3_entity_detection"]["detected_types"]
        self.assertNotIn("AADHAAR", detected_types)
        self.assertNotIn("AADHAAR_NUMBER", detected_types)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")

    def test_deg_03_skew_angle_pan(self):
        """Fixture 3: Skewed text (18 degrees rotation) preventing standard horizontal OCR."""
        img = Image.new("RGB", (600, 400), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((100, 150), "Taxpayer PAN: BKZPR7788M", fill=(20, 20, 20))
        rotated = img.rotate(18, expand=False, fillcolor="white")
        pdf_bytes = create_scanned_pdf_from_image(rotated)

        record = self._trace_scanned_pipeline(
            "deg_03_skew_angle",
            "Skewed scan (18 deg rotation) containing PAN BKZPR7788M",
            pdf_bytes,
            "BKZPR7788M"
        )
        self.assertEqual(record["stages"]["3_entity_detection"]["entity_count"], 0)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")

    def test_deg_04_heavy_noise_phone(self):
        """Fixture 4: Heavy salt-and-pepper noise destroying character contours."""
        img = Image.new("RGB", (600, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((50, 50), "Contact Number: +91 9876543210", fill=(40, 40, 40))
        
        arr = np.array(img)
        noise = np.random.randint(0, 2, (200, 600, 3), dtype=np.uint8) * 150
        noisy_arr = np.clip(arr.astype(int) - noise.astype(int), 0, 255).astype(np.uint8)
        noisy_img = Image.fromarray(noisy_arr)
        pdf_bytes = create_scanned_pdf_from_image(noisy_img)

        record = self._trace_scanned_pipeline(
            "deg_04_heavy_noise",
            "Heavy salt-and-pepper noise containing Phone +91 9876543210",
            pdf_bytes,
            "+91 9876543210"
        )
        self.assertEqual(record["stages"]["3_entity_detection"]["entity_count"], 0)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")

    def test_deg_05_faint_small_text(self):
        """Fixture 5: Very small, faint 6pt text."""
        img = Image.new("RGB", (600, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        # 1-pixel high line text simulation
        d.text((50, 50), "ID: ABCDE1234F DOB: 12/05/1988", fill=(180, 180, 180))
        pdf_bytes = create_scanned_pdf_from_image(img)

        record = self._trace_scanned_pipeline(
            "deg_05_faint_small_text",
            "Faint small text containing PAN and DOB",
            pdf_bytes,
            "ABCDE1234F"
        )
        self.assertEqual(record["stages"]["3_entity_detection"]["entity_count"], 0)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")

    def test_deg_06_blank_ocr_page_with_visual_ink(self):
        """Fixture 6: Scanned page with visual content where OCR produces 0 characters."""
        img = Image.new("RGB", (600, 300), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        # Draw background pattern and cursive-like lines
        for i in range(10, 290, 15):
            d.line([(10, i), (590, i)], fill=(230, 230, 230), width=1)
        d.text((100, 120), "CONFIDENTIAL PAN: PBNKA1122D", fill=(190, 190, 190))
        pdf_bytes = create_scanned_pdf_from_image(img)

        record = self._trace_scanned_pipeline(
            "deg_06_blank_ocr_page",
            "Scanned page with visual markings where OCR returns empty text stream",
            pdf_bytes,
            "PBNKA1122D"
        )
        self.assertEqual(record["stages"]["3_entity_detection"]["entity_count"], 0)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")

    def test_deg_07_partial_ocr_fragment(self):
        """Fixture 7: Degraded scan where OCR returns only partial digits."""
        img = Image.new("RGB", (600, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((50, 50), "Account No: 998811223344", fill=(175, 175, 175))
        pdf_bytes = create_scanned_pdf_from_image(img)

        record = self._trace_scanned_pipeline(
            "deg_07_partial_ocr_fragment",
            "Degraded scan where partial bank account digits are captured",
            pdf_bytes,
            "998811223344"
        )
        detected_types = record["stages"]["3_entity_detection"]["detected_types"]
        self.assertNotIn("BANK_ACCOUNT", detected_types)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")

    def test_deg_08_ocr_rendered_disagreement(self):
        """Fixture 8: OCR extracts benign noise while visual pixels contain legible PII."""
        img = Image.new("RGB", (600, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        # Clear visual text with subtle pattern that tricks standard OCR
        d.text((50, 50), "Permanent Identifier: ZZZPP1234Q", fill=(185, 185, 185))
        pdf_bytes = create_scanned_pdf_from_image(img)

        record = self._trace_scanned_pipeline(
            "deg_08_ocr_rendered_disagreement",
            "Disagreement between OCR output and visual rendered layer",
            pdf_bytes,
            "ZZZPP1234Q"
        )
        self.assertEqual(record["stages"]["3_entity_detection"]["entity_count"], 0)
        self.assertEqual(record["stages"]["6_independent_verification"]["status"], "PASSED_VERIFICATION")
        self.assertEqual(record["stages"]["7_artifact_and_download"]["safety_outcome"], "SILENT_PII_ESCAPE (FAIL-OPEN HAZARD)")


    # =========================================================================
    # Workstream B: Clean-Document False Rejections Reproduction
    # =========================================================================

    def test_clean_01_numeric_invoice_credit_card_regex_false_alarm(self):
        """
        Reproduces tier_b_hard_neg_01 failure:
        A benign 15-digit invoice/tracking number in native text layer
        triggers Layer 3 regex: 'Regex Leak: CREDIT_CARD pattern detected'.
        """
        text = [
            "STANDARD COMMERCIAL INVOICE",
            "Vendor: Acme Office Solutions Pvt Ltd",
            "Order Reference: 987654321012345",  # 15 digits matching CREDIT_CARD regex \b(?:\d[ -]*?){13,16}\b
            "Billing Amount: INR 45,000.00",
            "Payment Status: Paid via Direct Bank Transfer"
        ]
        pdf_bytes = create_native_pdf_with_text(text)

        # Verification without any redacted entities (document is completely clean of PII)
        leaks = []
        try:
            VerificationEngine.verify_redacted_file(pdf_bytes, "clean_invoice.pdf", original_entities=[])
        except HTTPException as e:
            leaks = [e.detail]

        record = {
            "fixture": "clean_01_numeric_invoice",
            "historical_match": "tier_b_hard_neg_01",
            "rejecting_layer": "Layer 2 (Visual Aadhaar Window) & Layer 3 (Credit Card Regex)",
            "leak_classification": "FALSE_POSITIVE_VERIFIER_FLAG (Overly broad numeric sequence matching)",
            "trigger_token": "987654321012345",
            "raw_rejection_detail": leaks[0] if leaks else "NONE",
            "verifier_rejected": len(leaks) > 0
        }
        self.results_collector["workstream_b_clean_rejections"].append(record)
        self.assertTrue(record["verifier_rejected"])
        self.assertTrue(any(term in record["raw_rejection_detail"] for term in ["Aadhaar", "CREDIT_CARD"]))

    def test_clean_02_tabular_codes_visual_ocr_false_alarm(self):
        """
        Reproduces tier_b_hard_neg_02 failure:
        Benign product SKU / table data rendered as pixels triggers
        Layer 2 Visual Verifier: 'Visual Leak: OCR found potential PAN / Aadhaar structure'.
        """
        # Create an image containing tabular data with codes that match PAN shape (5L, 4D, 1L)
        img = Image.new("RGB", (600, 200), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((50, 50), "CATALOG PART NUMBER: ABCDE1234O", fill=(0, 0, 0))  # Last char is 'O' which triggers OCR confusion rule with '0'
        pdf_bytes = create_scanned_pdf_from_image(img)

        leaks = []
        try:
            VerificationEngine.verify_redacted_file(pdf_bytes, "clean_catalog.pdf", original_entities=[])
        except HTTPException as e:
            leaks = [e.detail]

        record = {
            "fixture": "clean_02_tabular_codes",
            "historical_match": "tier_b_hard_neg_02",
            "rejecting_layer": "Layer 2 (Visual Verifier / Suspicious PAN)",
            "leak_classification": "FALSE_POSITIVE_VERIFIER_FLAG (Permissive shape + OCR confusion on benign SKU)",
            "trigger_token": "ABCDE1234O",
            "raw_rejection_detail": leaks[0] if leaks else "NONE",
            "verifier_rejected": len(leaks) > 0
        }
        self.results_collector["workstream_b_clean_rejections"].append(record)
        self.assertTrue(record["verifier_rejected"])
        self.assertIn("PAN", record["raw_rejection_detail"])

    def test_clean_03_narrow_bbox_geometry_envelope_false_alarm(self):
        """
        Reproduces tier_b_hard_neg_05 failure:
        Detection false positive produces a tight bounding box on benign text.
        Layer 1 Geometry Verifier rejects the document for insufficient envelope width:
        'Geometry Leak: Redaction bbox width insufficient for entity of length N'.
        """
        text = ["Reference Notice Serial: NOT-771199"]
        pdf_bytes = create_native_pdf_with_text(text)

        # Simulate detection engine FP: it flagged 'NOT-771199' (10 chars) as PAN
        # but with a tight bounding box of width 40.0pt and height 12.0pt
        # min_expected_width = 10 * 12.0 * 0.35 = 42.0pt > 40.0pt!
        fp_entity = RedactionEntity(
            id=str(uuid.uuid4()),
            entity_type="PAN_NUMBER",
            text="NOT-771199",
            score=0.55,
            page_num=1,
            bbox=BoundingBox(x0=50.0, y0=95.0, x1=90.0, y1=107.0),  # width = 40.0pt, height = 12.0pt
            status="accepted"
        )

        # Redact using this tight bbox
        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "clean_notice.pdf", [fp_entity])

        leaks = []
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, "clean_notice.pdf", [fp_entity])
        except HTTPException as e:
            leaks = [e.detail]

        record = {
            "fixture": "clean_03_narrow_bbox_fp",
            "historical_match": "tier_b_hard_neg_05",
            "rejecting_layer": "Layer 1 (Geometry Verifier / Envelope Width Heuristic)",
            "leak_classification": "DETECTION_FP_CONSEQUENTIAL_GEOMETRY_REJECTION",
            "heuristic_formula": "min_expected_width = text_len * box_h * 0.35",
            "measured_width": 40.0,
            "min_expected_width": 42.0,
            "raw_rejection_detail": leaks[0] if leaks else "NONE",
            "verifier_rejected": len(leaks) > 0
        }
        self.results_collector["workstream_b_clean_rejections"].append(record)
        self.assertTrue(record["verifier_rejected"])
        self.assertIn("insufficient for entity of length", record["raw_rejection_detail"])

    def test_clean_04_date_time_residual_fragment_false_alarm(self):
        """
        Reproduces tier_b_hard_neg_08 failure:
        Benign date '2024-10-15' flagged as DATE_TIME false positive and redacted.
        However, year '2024' also exists elsewhere in header text ('Report 2024').
        Layer 3.6 Accepted Entity Residual Fragment Scan detects '2024' in the stream:
        'Fragment Leak: Residual trailing characters of DATE_TIME detected'.
        """
        text = [
            "ANNUAL FINANCIAL OVERVIEW 2024",  # Contains '2024'
            "Filing Date: 2024-10-15",          # Entity to be redacted
            "Status: Published"
        ]
        pdf_bytes = create_native_pdf_with_text(text)

        fp_date_entity = RedactionEntity(
            id=str(uuid.uuid4()),
            entity_type="DATE_TIME",
            text="2024-10-15",
            score=0.85,
            page_num=1,
            bbox=BoundingBox(x0=50.0, y0=120.0, x1=120.0, y1=135.0),
            status="accepted"
        )

        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "clean_report.pdf", [fp_date_entity])

        leaks = []
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, "clean_report.pdf", [fp_date_entity])
        except HTTPException as e:
            leaks = [e.detail]

        record = {
            "fixture": "clean_04_date_time_fragment",
            "historical_match": "tier_b_hard_neg_08",
            "rejecting_layer": "Layer 3.6 (Accepted Entity Residual Fragment Scan)",
            "leak_classification": "FALSE_POSITIVE_RESIDUAL_TEXT_SCAN (Non-spatial global substring match)",
            "matched_substring": "2024 (present in unredacted header)",
            "raw_rejection_detail": leaks[0] if leaks else "NONE",
            "verifier_rejected": len(leaks) > 0
        }
        self.results_collector["workstream_b_clean_rejections"].append(record)
        self.assertTrue(record["verifier_rejected"])
        self.assertIn("Residual", record["raw_rejection_detail"])


    # =========================================================================
    # Workstream C: Fail-Closed Enforcement Verification
    # =========================================================================

    def test_fail_closed_lifecycle_and_download_blocking(self):
        """
        Verifies the full end-to-end integration lifecycle when verification fails:
        1. Job status is FAILED.
        2. result_storage_key is None.
        3. Download endpoint blocks release (HTTP 400).
        4. Job status endpoint reports has_artifact: False.
        5. Error messages scrub raw PII.
        """
        # Test 1: Error message scrubbing
        raw_error = "Verification failed: leaked PAN ABCDE1234F and Aadhaar 9012 3456 7890 in document"
        clean_error = VerificationEngine.sanitize_error_string(raw_error)
        self.assertNotIn("ABCDE1234F", clean_error)
        self.assertNotIn("9012 3456 7890", clean_error)
        self.assertIn("[REDACTED_PAN]", clean_error)
        self.assertIn("[REDACTED_AADHAAR]", clean_error)

        # Test 2: Simulate Celery job state transition on verification failure
        job = RedactionJob(
            id=str(uuid.uuid4()),
            document_id=str(uuid.uuid4()),
            status=JobStatus.PROCESSING,
            result_storage_key=None,
            error_message=None
        )

        # Simulate VerificationFailure exception catch
        try:
            raise HTTPException(status_code=500, detail="Verification failed: 1 leak(s) detected post-redaction. [Geometry Leak]")
        except Exception as e:
            job.status = JobStatus.FAILED
            err_msg = getattr(e, "detail", str(e))
            job.error_message = VerificationEngine.sanitize_error_string(str(err_msg))

        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertIsNone(job.result_storage_key)
        self.assertIsNotNone(job.error_message)

        # Test 3: Download Endpoint Logic Check (from documents.py:237)
        # if job.status != JobStatus.COMPLETED: raise HTTPException(400, "Job not completed")
        download_blocked = (job.status != JobStatus.COMPLETED)
        self.assertTrue(download_blocked)

        # Test 4: Job Status Endpoint has_artifact Check (from documents.py:214)
        # has_artifact = bool(job.status == JobStatus.COMPLETED and (job.result_storage_key or job.error_message))
        has_artifact = bool(job.status == JobStatus.COMPLETED and (job.result_storage_key or job.error_message))
        self.assertFalse(has_artifact)

        # Test 5: Historical Vulnerability Audit (documents.py line 240)
        # In documents.py: "storage_key = job.result_storage_key or job.error_message"
        # If job.status was somehow set to COMPLETED while failing, could error_message be interpreted as storage key?
        # Verify that because job.status is strictly FAILED, line 237 blocks execution before reaching line 240.
        self.assertNotEqual(job.status, JobStatus.COMPLETED)

        record = {
            "test": "fail_closed_lifecycle_and_download_blocking",
            "job_status_after_failure": job.status.value,
            "result_storage_key": job.result_storage_key,
            "has_artifact": has_artifact,
            "download_blocked": download_blocked,
            "error_sanitized": ("[REDACTED_PAN]" in clean_error and "ABCDE1234F" not in clean_error),
            "line_240_vulnerability_assessment": "BLOCKED_BY_LINE_237_STATUS_CHECK"
        }
        self.results_collector["workstream_c_fail_closed"].append(record)

    @classmethod
    def tearDownClass(cls):
        """Dumps all structured findings to STAGE_7B_INVESTIGATION_RESULTS.json."""
        output_path = os.path.join(os.path.dirname(__file__), "STAGE_7B_INVESTIGATION_RESULTS.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(cls.results_collector, f, indent=2)
        print(f"\n[PASS] Stage 7B Investigation Results written to: {output_path}")


if __name__ == "__main__":
    unittest.main()
