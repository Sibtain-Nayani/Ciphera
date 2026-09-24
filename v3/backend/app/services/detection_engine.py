import uuid
from typing import List

from app.schemas.document import CanonicalDocument, RedactionEntity, BoundingBox
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
            cls._pipeline = f1.DetectionPipeline(model="hi_core_news_sm")
        return cls._pipeline

    @classmethod
    def run_detection(cls, doc: CanonicalDocument, threshold: float = 0.5) -> List[RedactionEntity]:
        pipeline = cls.get_pipeline()
        
        # 1. Run inference on full text (to preserve context windows)
        raw_entities = pipeline.run(text=doc.full_text, threshold=threshold)
        
        redactions = []
        
        # 2. Map back to canonical blocks
        for ent in raw_entities:
            for page in doc.pages:
                for block in page.blocks:
                    # Check for overlap
                    overlap_start = max(ent.start, block.start_index)
                    overlap_end = min(ent.end, block.end_index)
                    
                    if overlap_start < overlap_end:
                        bbox = block.bbox
                        if bbox and block.start_index < block.end_index:
                            block_len = block.end_index - block.start_index
                            char_width = (bbox.x1 - bbox.x0) / block_len
                            
                            rel_start = overlap_start - block.start_index
                            rel_end = overlap_end - block.start_index
                            
                            exact_x0 = bbox.x0 + (rel_start * char_width)
                            exact_x1 = bbox.x0 + (rel_end * char_width)
                            
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
                            page_num=page.page_num,
                            bbox=bbox,
                            status="pending"
                        ))
                    
        return redactions
