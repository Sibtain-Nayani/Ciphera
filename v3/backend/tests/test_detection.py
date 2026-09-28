import pytest
from app.schemas.document import CanonicalDocument, CanonicalBlock, BoundingBox
from app.services.detection_engine import DetectionEngine
import feature1_pipeline_upgrade as f1

@pytest.fixture(scope="module")
def pipeline():
    # Make sure we load the pipeline once
    pipe = DetectionEngine.get_pipeline()
    f1.pipeline = pipe
    return pipe

def test_detection_engine_math(pipeline):
    text = "Aadhaar Number: 1234 5678 9012\n"
    # Provide a dummy bbox
    block = CanonicalBlock(
        page_num=1,
        text=text,
        bbox=BoundingBox(x0=100.0, y0=200.0, x1=400.0, y1=210.0), # Width 300
        start_index=0,
        end_index=len(text)
    )
    doc = CanonicalDocument(
        metadata={"filename": "test.pdf", "type": "pdf"},
        blocks=[block],
        full_text=text,
        page_count=1
    )
    
    redactions = DetectionEngine.run_detection(doc, threshold=0.5)
    
    # Check if Aadhaar is detected
    aadhaar_redactions = [r for r in redactions if r.entity_type == "AADHAAR_NUMBER"]
    assert len(aadhaar_redactions) > 0
    
    aadhaar = aadhaar_redactions[0]
    
    # Check that the bbox doesn't fall short
    assert aadhaar.bbox.x1 > 380 # It should reach near the end of the 400px box

def test_columnar_inference():
    # Test if columnar inference flags a missing record
    from app.services.columnar_inference import ColumnarInferenceEngine
    
    blocks = [
        CanonicalBlock(page_num=1, text="ABCD1234E", bbox=BoundingBox(x0=50, y0=100, x1=150, y1=110), start_index=0, end_index=9),
        CanonicalBlock(page_num=1, text="WXYZ9876F", bbox=BoundingBox(x0=50, y0=120, x1=150, y1=130), start_index=10, end_index=19),
        CanonicalBlock(page_num=1, text="446039355", bbox=BoundingBox(x0=50, y0=140, x1=150, y1=150), start_index=20, end_index=29)
    ]
    doc = CanonicalDocument(metadata={}, blocks=blocks, full_text="", page_count=1)
    
    from app.schemas.document import RedactionEntity
    entities = [
        RedactionEntity(id="1", entity_type="PAN_NUMBER", text="ABCD1234E", score=0.9, page_num=1, bbox=BoundingBox(x0=50, y0=100, x1=150, y1=110), start_index=0, end_index=9, status="pending"),
        RedactionEntity(id="2", entity_type="PAN_NUMBER", text="WXYZ9876F", score=0.9, page_num=1, bbox=BoundingBox(x0=50, y0=120, x1=150, y1=130), start_index=10, end_index=19, status="pending")
    ]
    
    new_entities = ColumnarInferenceEngine.run_inference(doc, entities)
    
    assert len(new_entities) == 3
    assert new_entities[2].entity_type == "INFERRED_PAN_NUMBER"
    assert new_entities[2].text == "446039355"
