import uuid
import re
from typing import List

from app.schemas.document import CanonicalDocument, RedactionEntity, BoundingBox
from app.services.columnar_inference import ColumnarInferenceEngine
from app.services.fuzzy_checksum import FuzzyOCRChecksumValidator
import feature1_pipeline_upgrade as f1

class DetectionEngine:
    """
    Phase 4: Detection Engine 2.0 (Enhanced with Columnar Inference & Fuzzy OCR Checksums)
    Takes a CanonicalDocument and extracts entities using the V3.6 Pipeline.
    Recovers OCR typos in Aadhaar and PAN numbers on scanned documents.
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
        raw_entities = list(pipeline.run(text=doc.full_text, threshold=threshold))
        
        # 1b. Fuzzy OCR Recovery for Scanned Aadhaar credentials
        for match in re.finditer(r'\b(?:\w{4}[-\s]?\w{4}[-\s]?\w{4}|\w{12})\b', doc.full_text):
            cand_text = match.group(0)
            is_valid, repaired, score = FuzzyOCRChecksumValidator.validate_aadhaar_fuzzy(cand_text)
            if is_valid and score >= 0.90:
                overlap = any(
                    max(match.start(), getattr(r, "start", -1)) < min(match.end(), getattr(r, "end", -1))
                    for r in raw_entities
                )
                if not overlap:
                    class FuzzyCandidate:
                        def __init__(self, t, s, e, score):
                            self.entity_type = t
                            self.start = s
                            self.end = e
                            self.score = score
                    raw_entities.append(FuzzyCandidate("AADHAAR_NUMBER", match.start(), match.end(), score))

        # 1c. Fuzzy OCR Recovery for Scanned PAN credentials
        for match in re.finditer(r'\b[A-Za-z0-9]{10}\b', doc.full_text):
            cand_text = match.group(0)
            is_valid, repaired, score = FuzzyOCRChecksumValidator.validate_pan_fuzzy(cand_text)
            if is_valid and score >= 0.90:
                overlap = any(
                    max(match.start(), getattr(r, "start", -1)) < min(match.end(), getattr(r, "end", -1))
                    for r in raw_entities
                )
                if not overlap:
                    class FuzzyCandidate:
                        def __init__(self, t, s, e, score):
                            self.entity_type = t
                            self.start = s
                            self.end = e
                            self.score = score
                    raw_entities.append(FuzzyCandidate("PAN_NUMBER", match.start(), match.end(), score))

        # 1d. Propagate table column context from verified headers to unflagged cells
        text_table_inferred = ColumnarInferenceEngine.infer_text_tables(doc.full_text)
        for inf in text_table_inferred:
            overlap = any(
                max(inf["start"], getattr(r, "start", -1)) < min(inf["end"], getattr(r, "end", -1))
                for r in raw_entities
            )
            if not overlap:
                class InferredCandidate:
                    def __init__(self, t, s, e, score):
                        self.entity_type = t
                        self.start = s
                        self.end = e
                        self.score = score
                raw_entities.append(InferredCandidate(inf["entity_type"], inf["start"], inf["end"], inf["score"]))

        redactions = []
        
        # 2. Map back to canonical blocks
        for ent in raw_entities:
            for block in doc.blocks:
                overlap_start = max(ent.start, block.start_index)
                overlap_end = min(ent.end, block.end_index)
                
                if overlap_start < overlap_end:
                    bbox = block.bbox
                    if bbox and block.start_index < block.end_index:
                        visible_len = len(block.text.rstrip('\n'))
                        visible_len = max(visible_len, 1)
                        
                        char_width = (bbox.x1 - bbox.x0) / visible_len
                        
                        rel_start = overlap_start - block.start_index
                        rel_end = overlap_end - block.start_index
                        rel_end = min(rel_end, visible_len)
                        
                        exact_x0 = bbox.x0 + (rel_start * char_width)
                        exact_x1 = bbox.x0 + (rel_end * char_width)
                        
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
                    
        return redactions
