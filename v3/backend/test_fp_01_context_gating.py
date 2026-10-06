import pytest
from feature1_pipeline_upgrade import DetectionPipeline

def test_context_gating_respects_sentence_boundaries():
    text = "Phone: 9876543210. Patient 9876543211. 9876543212. Tracking number: 9876543213. \u092e\u092c\u093e\u0907\u0932 : 9876543214."
    
    pipeline = DetectionPipeline(use_transformer=False)
    entities = pipeline.run(text)
    phones = [e.text for e in entities if e.entity_type == "PHONE_NUMBER"]
    
    # "Phone: 9876543210" should be detected.
    assert "9876543210" in phones, "'Phone: 9876543210' should be detected."
    
    # Separate tracking numbers should NOT inherit the context from the first sentence
    assert "9876543211" not in phones, "Patient ID should not inherit 'Phone' context across period."
    assert "9876543212" not in phones, "Unrelated ID should not inherit 'Phone' context."
    assert "9876543213" not in phones, "Tracking number should not inherit 'Phone' context."

def test_context_gating_respects_newline_boundaries():
    text = "Contact tel: 9999999999\nOrder Reference 7777777777\nInvoice 6666666666"
    
    pipeline = DetectionPipeline(use_transformer=False)
    entities = pipeline.run(text)
    phones = [e.text for e in entities if e.entity_type == "PHONE_NUMBER"]
    
    assert "9999999999" in phones, "Phone number on same line as 'tel' should be detected."
    assert "7777777777" not in phones, "Order Reference on different line should not inherit context."
    assert "6666666666" not in phones, "Invoice on different line should not inherit context."
