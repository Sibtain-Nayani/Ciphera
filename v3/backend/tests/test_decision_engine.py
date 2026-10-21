import pytest
from app.services.decision_engine import DecisionEngine
from app.schemas.document import RedactionEntity, BoundingBox

def create_mock_entity(score: float, entity_type: str = "PERSON") -> RedactionEntity:
    return RedactionEntity(
        id="mock_id",
        entity_type=entity_type,
        text="Sample Person",
        score=score,
        page_num=1,
        bbox=BoundingBox(x0=50, y0=50, x1=150, y1=65),
        start_index=0,
        end_index=13,
        status="pending"
    )

def test_decision_engine_balanced():
    # Balanced Mode: Auto >= 0.85, Review >= 0.50
    entities = [
        create_mock_entity(0.95),  # Should be accepted / AUTO
        create_mock_entity(0.60),  # Should be pending / REVIEW
        create_mock_entity(0.20)   # Should be rejected / IGNORE
    ]
    
    results = DecisionEngine.apply_policies(entities, {"mode": "balanced"})
    assert results[0].status in ["AUTO", "accepted"]
    assert results[1].status in ["REVIEW", "pending"]
    assert results[2].status in ["IGNORE", "rejected"]

def test_decision_engine_indian_pii_guardrails():
    # Aadhaar/PAN require >= 0.90 for AUTO. Otherwise they go to REVIEW if >= review_threshold
    # Balanced mode review_threshold = 0.50
    
    entities = [
        create_mock_entity(0.95, "AADHAAR_NUMBER"), # AUTO / accepted
        create_mock_entity(0.85, "AADHAAR_NUMBER"), # REVIEW / pending (needs 0.90)
        create_mock_entity(0.40, "AADHAAR_NUMBER")  # IGNORE / rejected (below review threshold)
    ]
    
    results = DecisionEngine.apply_policies(entities, {"mode": "balanced"})
    assert results[0].status in ["AUTO", "accepted"]
    assert results[1].status in ["REVIEW", "pending"]
    assert results[2].status in ["IGNORE", "rejected"]

def test_decision_engine_high_precision():
    # High Precision: Auto >= 0.95, Review >= 0.75
    entities = [
        create_mock_entity(0.96), # AUTO / accepted
        create_mock_entity(0.80), # REVIEW / pending
        create_mock_entity(0.70)  # IGNORE / rejected
    ]
    results = DecisionEngine.apply_policies(entities, {"mode": "high_precision"})
    assert results[0].status in ["AUTO", "accepted"]
    assert results[1].status in ["REVIEW", "pending"]
    assert results[2].status in ["IGNORE", "rejected"]

def test_decision_engine_high_recall():
    # High Recall: Auto >= 0.70, Review >= 0.30
    entities = [
        create_mock_entity(0.75), # AUTO / accepted
        create_mock_entity(0.40), # REVIEW / pending
        create_mock_entity(0.10)  # IGNORE / rejected
    ]
    results = DecisionEngine.apply_policies(entities, {"mode": "high_recall"})
    assert results[0].status in ["AUTO", "accepted"]
    assert results[1].status in ["REVIEW", "pending"]
    assert results[2].status in ["IGNORE", "rejected"]
