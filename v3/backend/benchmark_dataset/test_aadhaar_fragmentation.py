import pytest
import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__))); from feature1_pipeline_upgrade import DetectionPipeline


@pytest.fixture(scope="module")
def pipeline():
    return DetectionPipeline(use_transformer=False)

def test_doc_004_failure(pipeline):
    text = "P A N : B V C P Q 9 9 9 9 Z\\nA a d h a a r : 1 1 2 2   3 3 4 4   5 5 6 6"
    results = pipeline.run(text)
    
    pan = next((r for r in results if r.entity_type == "PAN_NUMBER"), None)
    assert pan is not None
    assert pan.text == "B V C P Q 9 9 9 9 Z"
    
    aadhaar = next((r for r in results if r.entity_type == "AADHAAR_NUMBER"), None)
    assert aadhaar is not None
    assert aadhaar.text == "1 1 2 2   3 3 4 4   5 5 6 6"

def test_normal_aadhaar(pipeline):
    text = "Here is my Aadhaar: 2234 5678 9012 for your records."
    results = pipeline.run(text)
    aadhaar = next((r for r in results if r.entity_type == "AADHAAR_NUMBER"), None)
    assert aadhaar is not None
    assert aadhaar.text == "2234 5678 9012"

def test_fragmented_aadhaar_ordinary_spaces(pipeline):
    text = "A a d h a a r : 2 3 4 5 6 7 8 9 0 1 2 2"
    results = pipeline.run(text)
    aadhaar = next((r for r in results if r.entity_type == "AADHAAR_NUMBER"), None)
    assert aadhaar is not None
    assert aadhaar.text == "2 3 4 5 6 7 8 9 0 1 2 2"

def test_fragmented_aadhaar_multiple_spaces(pipeline):
    text = "A a d h a a r : 2 3 4 5     6 7 8 9     0 1 2 2"
    results = pipeline.run(text)
    aadhaar = next((r for r in results if r.entity_type == "AADHAAR_NUMBER"), None)
    assert aadhaar is not None
    assert aadhaar.text == "2 3 4 5     6 7 8 9     0 1 2 2"

def test_unrelated_spaced_sequence_ten_digits(pipeline):
    text = "Here are some numbers: 9 8 7 6 5 4 3 2 1 0. Do not redact."
    results = pipeline.run(text)
    phone = next((r for r in results if r.entity_type == "PHONE_NUMBER"), None)
    # Should NOT be a phone number because it has no context and is highly fragmented
    assert phone is None

def test_numeric_reference_not_aadhaar(pipeline):
    text = "Order tracking number: 2234 5678 9012"
    results = pipeline.run(text)
    aadhaar = next((r for r in results if r.entity_type == "AADHAAR_NUMBER"), None)
    # Should NOT be an Aadhaar because the context is 'tracking'
    assert aadhaar is None
