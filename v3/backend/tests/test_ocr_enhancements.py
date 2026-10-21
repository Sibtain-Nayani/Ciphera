import pytest
import numpy as np
import cv2

from app.services.image_enhancer import ImageScanEnhancer
from app.services.fuzzy_checksum import FuzzyOCRChecksumValidator
from app.services.ml_context_classifier import ContextualMLClassifier
from app.services.decision_engine import DecisionEngine
from app.schemas.document import RedactionEntity, BoundingBox

def test_image_enhancer_rotation():
    # Create a synthetic white image with a dark horizontal rectangle
    img = np.ones((200, 200), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 90), (180, 110), 0, -1)
    
    # Rotate by 10 degrees
    rotated = ImageScanEnhancer.rotate_image(img, 10.0)
    assert rotated.shape[0] > 0
    assert rotated.shape[1] > 0

    # Preprocess
    cleaned, angle = ImageScanEnhancer.preprocess_for_ocr(img, auto_deskew=True, remove_glare=True)
    assert isinstance(cleaned, np.ndarray)
    assert isinstance(angle, float)

def test_fuzzy_aadhaar_validator():
    # Valid Aadhaar numbers that pass Verhoeff
    valid_aadhaar = "999999990019" # standard verhoeff test vector
    is_valid, rep, score = FuzzyOCRChecksumValidator.validate_aadhaar_fuzzy(valid_aadhaar)
    assert is_valid is True
    assert score == 1.0

    # Aadhaar with OCR typo: 'B' instead of '8'
    ocr_typo = "999999990019"
    # Replace last digit with 'o' or simulate confusion
    invalid = "123412341234"
    is_valid, _, _ = FuzzyOCRChecksumValidator.validate_aadhaar_fuzzy(invalid)
    assert is_valid is False

def test_fuzzy_pan_validator():
    # Valid PAN (4th character 'P' for Individual or 'C' for Company)
    valid_pan = "ABCPE1234F"
    is_valid, rep, score = FuzzyOCRChecksumValidator.validate_pan_fuzzy(valid_pan)
    assert is_valid is True
    assert score >= 0.90

    # PAN with OCR typo: 'O' instead of '0' in digits position
    typo_pan = "ABCPE123OF"
    is_valid, rep, score = FuzzyOCRChecksumValidator.validate_pan_fuzzy(typo_pan)
    assert is_valid is True
    assert rep == "ABCPE1230F"
    assert score >= 0.90

    # Invalid PAN (invalid 4th char 'X')
    invalid_pan = "ABCXE1234F"
    is_valid, _, _ = FuzzyOCRChecksumValidator.validate_pan_fuzzy(invalid_pan)
    assert is_valid is False

def test_contextual_ml_classifier_benign_suppression():
    classifier = ContextualMLClassifier()

    # Case 1: "Total" header should be suppressed (NOT redacted)
    should_redact, prob, reason = classifier.should_redact(
        text="Total",
        bbox={"x0": 400.0, "y0": 500.0, "x1": 450.0, "y1": 515.0},
        presidio_score=0.85,
        threshold=0.40
    )
    assert should_redact is False
    assert prob < 0.40

    # Case 2: "Amount" or "$" should be suppressed
    should_redact, prob, _ = classifier.should_redact(
        text="INR",
        bbox={"x0": 350.0, "y0": 500.0, "x1": 380.0, "y1": 515.0},
        presidio_score=0.75,
        threshold=0.40
    )
    assert should_redact is False

    # Case 3: "Patient Name: Rajesh Sharma" should be CONFIRMED (redacted)
    should_redact, prob, reason = classifier.should_redact(
        text="Rajesh Sharma",
        bbox={"x0": 100.0, "y0": 200.0, "x1": 250.0, "y1": 215.0},
        presidio_score=0.85,
        preceding_text="Patient Name:",
        threshold=0.40
    )
    assert should_redact is True
    assert prob >= 0.85

def test_decision_engine_with_ml_filter():
    entities = [
        RedactionEntity(
            id="1",
            entity_type="ORGANIZATION",
            text="Subtotal", # benign header often flagged by NER
            score=0.80,
            page_num=1,
            bbox=BoundingBox(x0=100, y0=200, x1=160, y1=215),
            start_index=0,
            end_index=8,
            status="pending"
        ),
        RedactionEntity(
            id="2",
            entity_type="PERSON",
            text="Vikram Malhotra",
            score=0.88,
            page_num=1,
            bbox=BoundingBox(x0=100, y0=100, x1=220, y1=115),
            start_index=20,
            end_index=35,
            status="pending"
        )
    ]

    filtered = DecisionEngine.apply_policies(entities, policy_config={"mode": "balanced"})
    # "Subtotal" must be rejected by ML classifier
    subtotal_ent = next(e for e in filtered if e.id == "1")
    assert subtotal_ent.status == "rejected"

    # "Vikram Malhotra" must be accepted
    person_ent = next(e for e in filtered if e.id == "2")
    assert person_ent.status == "accepted"
