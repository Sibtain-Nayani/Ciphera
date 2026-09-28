import pytest
from app.services.decision_engine import DecisionEngine
from app.schemas.document import RedactionEntity, BoundingBox

def create_mock_entity(score: float, entity_type: str = "PERSON") -> RedactionEntity:
    return RedactionEntity(
        id="mock_id",
        entity_type=entity_type,
        text="Sample",
        score=score,
        page_num=1,
        bbox=BoundingBox(x0=0, y0=0, x1=10, y1=10),
        start_index=0,
        end_index=6,
        status="pending"
    )

def test_decision_engine_balanced():
    # Balanced Mode: Auto >= 0.85, Review >= 0.50
    entities = [
        create_mock_entity(0.95),  # Should be AUTO
        create_mock_entity(0.60),  # Should be REVIEW
        create_mock_entity(0.20)   # Should be IGNORE
    ]
    
    results = DecisionEngine.apply_policies(entities, {"mode": "balanced"})
    assert results[0].status == "AUTO"
    assert results[1].status == "REVIEW"
    assert results[2].status == "IGNORE"

def test_decision_engine_indian_pii_guardrails():
    # Aadhaar/PAN require >= 0.90 for AUTO. Otherwise they go to REVIEW if >= review_threshold
    # Balanced mode review_threshold = 0.50
    
    entities = [
        create_mock_entity(0.95, "AADHAAR_NUMBER"), # AUTO
        create_mock_entity(0.85, "AADHAAR_NUMBER"), # REVIEW (even though > 0.85, Aadhaar needs 0.90)
        create_mock_entity(0.40, "AADHAAR_NUMBER")  # IGNORE (below review threshold)
    ]
    
    results = DecisionEngine.apply_policies(entities, {"mode": "balanced"})
    assert results[0].status == "AUTO"
    assert results[1].status == "REVIEW"
    assert results[2].status == "IGNORE"

def test_decision_engine_high_precision():
    # High Precision: Auto >= 0.95, Review >= 0.75
    entities = [
        create_mock_entity(0.96), # AUTO
        create_mock_entity(0.80), # REVIEW
        create_mock_entity(0.70)  # IGNORE
    ]
    results = DecisionEngine.apply_policies(entities, {"mode": "high_precision"})
    assert results[0].status == "AUTO"
    assert results[1].status == "REVIEW"
    assert results[2].status == "IGNORE"

def test_decision_engine_high_recall():
    # High Recall: Auto >= 0.70, Review >= 0.30
    entities = [
        create_mock_entity(0.75), # AUTO
        create_mock_entity(0.40), # REVIEW
        create_mock_entity(0.10)  # IGNORE
    ]
    results = DecisionEngine.apply_policies(entities, {"mode": "high_recall"})
    assert results[0].status == "AUTO"
    assert results[1].status == "REVIEW"
    assert results[2].status == "IGNORE"
