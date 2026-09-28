import uuid
from typing import List

from app.schemas.document import CanonicalDocument, RedactionEntity, BoundingBox
from app.services.columnar_inference import ColumnarInferenceEngine
import feature1_pipeline_upgrade as f1

class DetectionEngine:
    """
    Phase 4: Detection Engine 2.0
    Takes a CanonicalDocument and extracts entities using the existing V3.6 Pipeline.
    Projects the entities back onto their exact page and bounding box coordinates.
    """
    
    _pipeline = None

    @classmethod
    def get_pipeline(cls) -> f1.DetectionPipeline:
        if cls._pipeline is None:
            cls._pipeline = f1.DetectionPipeline()
        return cls._pipeline

    @classmethod
    def run_detection(cls, doc: CanonicalDocument, threshold: float = 0.5) -> List[RedactionEntity]:
        pipeline = cls.get_pipeline()
        
        # 1. Run inference on full text (to preserve context windows)
        raw_entities = pipeline.run(text=doc.full_text, threshold=threshold)
        
        redactions = []
        
        # 2. Map back to canonical blocks
        for ent in raw_entities:
            # Find which block(s) this entity belongs to based on character indices
            for block in doc.blocks:
                # Check for overlap
                overlap_start = max(ent.start, block.start_index)
                overlap_end = min(ent.end, block.end_index)
                
                if overlap_start < overlap_end:
                    # There is an overlap! This block contains (part of) the entity.
                    # We compute the exact bounding box proportionally for PDF text.
                    # (In Phase 3 OCR, each word is a block, so we just take the block's bbox)
                    
                    bbox = block.bbox
                    if bbox and block.start_index < block.end_index:
                        # Estimate horizontal proportional bounding box for the substring
                        # The parser appends a newline to block text, but the PDF bbox only covers visible chars!
                        # We must compute width using the visible length to avoid falling short at the end.
                        visible_len = len(block.text.rstrip('\n'))
                        visible_len = max(visible_len, 1) # Prevent division by zero
                        
                        char_width = (bbox.x1 - bbox.x0) / visible_len
                        
                        rel_start = overlap_start - block.start_index
                        rel_end = overlap_end - block.start_index
                        
                        # If the entity includes the trailing newline, cap it to visible_len for bbox calc
                        rel_end = min(rel_end, visible_len)
                        
                        exact_x0 = bbox.x0 + (rel_start * char_width)
                        exact_x1 = bbox.x0 + (rel_end * char_width)
                        
                        # Add a tiny padding (1 pixel) to ensure full coverage due to font kerning
                        exact_x0 = max(bbox.x0, exact_x0 - 1)
                        exact_x1 = min(bbox.x1, exact_x1 + 2)
                        
                        bbox = BoundingBox(
                            x0=exact_x0,
                            y0=bbox.y0,
                            x1=exact_x1,
                            y1=bbox.y1
                        )

                    redactions.append(RedactionEntity(
                        id=str(uuid.uuid4()),
                        entity_type=ent.entity_type,
                        text=doc.full_text[overlap_start:overlap_end],
                        score=ent.score,
                        page_num=block.page_num,
                        bbox=bbox,
                        start_index=overlap_start,
                        end_index=overlap_end,
                        status="pending"
                    ))
                    
        
        # 3. Apply Columnar Inference to catch missed tabular records
        redactions = ColumnarInferenceEngine.run_inference(doc, redactions)
        
        return redactions
