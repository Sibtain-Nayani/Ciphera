import pytest
from feature1_pipeline_upgrade import DetectionPipeline
from feature12_hindi_support import HindiPipeline

@pytest.fixture(scope="module")
def pipeline():
    return DetectionPipeline()

@pytest.fixture(scope="module")
def hindi_pipeline():
    return HindiPipeline()

def test_doc010_aadhaar_ocr(pipeline):
    text = "The Aadhaar is 1l22 3344 55O6. PAN: I3CDEI234O. Legitimate serial OOOO1111OOOO."
    results = pipeline.run(text)
    entities = {e.entity_type: e.text for e in results}
    assert "AADHAAR_NUMBER" in entities
    assert entities["AADHAAR_NUMBER"] == "1l22 3344 55O6"
    assert "PAN_NUMBER" in entities
    assert entities["PAN_NUMBER"] == "I3CDEI234O"
    # Negative check: serial number must not be detected as Aadhaar or PAN
    assert "OOOO1111OOOO" not in entities.values()

def test_normal_aadhaar(pipeline):
    text = "Aadhaar: 4532 8812 9901"
    results = pipeline.run(text)
    aadhaar = [e for e in results if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar) == 1
    assert aadhaar[0].text == "4532 8812 9901"

def test_spaced_aadhaar(pipeline):
    text = "UID: 4532-8812-9901"
    results = pipeline.run(text)
    aadhaar = [e for e in results if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar) == 1
    assert aadhaar[0].text == "4532-8812-9901"

def test_fragmented_aadhaar_doc004(pipeline):
    text = "P A N : B V C P Q 9 9 9 9 Z\nA a d h a a r : 1 1 2 2   3 3 4 4   5 5 6 6"
    results = pipeline.run(text)
    entities = {e.entity_type: e.text for e in results}
    assert "AADHAAR_NUMBER" in entities
    assert entities["AADHAAR_NUMBER"] == "1 1 2 2   3 3 4 4   5 5 6 6"

def test_ocr_confused_aadhaar(pipeline):
    text = "Aadhaar Number: 4532 88I2 990I"
    results = pipeline.run(text)
    aadhaar = [e for e in results if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar) == 1
    assert aadhaar[0].text == "4532 88I2 990I"

def test_negative_serial_not_aadhaar(pipeline):
    text = "Device Serial Number: OOOO1111OOOO is registered."
    results = pipeline.run(text)
    aadhaar = [e for e in results if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar) == 0

def test_negative_phone_not_aadhaar(pipeline):
    text = "Contact 9876543210 for support."
    results = pipeline.run(text)
    aadhaar = [e for e in results if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar) == 0

def test_negative_tracking_not_aadhaar(pipeline):
    text = "Order tracking ref: 987654321012."
    results = pipeline.run(text)
    aadhaar = [e for e in results if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar) == 0

def test_hindi_aadhaar_with_label(hindi_pipeline):
    text = "आधार संख्या: 4532 8812 9901"
    results = hindi_pipeline.run(text)
    aadhaar = [e for e in results if e.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar) == 1
    assert aadhaar[0].text == "4532 8812 9901"
