from typing import List
import uuid
from app.schemas.document import CanonicalDocument, RedactionEntity, BoundingBox

class ColumnarInferenceEngine:
    """
    Analyzes spatial distribution of detected entities to infer table columns.
    If a column has multiple PII detections, it propagates the redaction
    to other unflagged text blocks in that same vertical column.
    """
    
    @staticmethod
    def run_inference(doc: CanonicalDocument, entities: List[RedactionEntity]) -> List[RedactionEntity]:
        # Only applies to documents with spatial bounding boxes (PDFs/Images)
        if not doc.blocks or not doc.blocks[0].bbox:
            return entities
            
        new_entities = list(entities)
        
        # Group by page
        for page_num in range(1, doc.page_count + 1):
            page_blocks = [b for b in doc.blocks if b.page_num == page_num and b.bbox]
            page_entities = [e for e in new_entities if e.page_num == page_num and e.bbox]
            
            # Find distinct horizontal clusters (columns) formed by entities
            # We'll use the center X coordinate
            clusters = [] # list of dicts: {'x_center': float, 'x_min': float, 'x_max': float, 'type': str, 'entities': list}
            
            for ent in page_entities:
                # Ignore generic types for column spreading, 
                # also ignore very low confidence detections to avoid anchoring bad columns
                if ent.entity_type in ["DATE_TIME", "O", "UNKNOWN"] or ent.score < 0.5:
                    continue 
                    
                x_center = (ent.bbox.x0 + ent.bbox.x1) / 2
                
                # Check if it fits in an existing cluster (within e.g. 50 pixels)
                matched = False
                for cluster in clusters:
                    if abs(cluster['x_center'] - x_center) < 40.0:
                        cluster['entities'].append(ent)
                        cluster['x_min'] = min(cluster['x_min'], ent.bbox.x0)
                        cluster['x_max'] = max(cluster['x_max'], ent.bbox.x1)
                        # Update rolling average center
                        cluster['x_center'] = (cluster['x_center'] * (len(cluster['entities'])-1) + x_center) / len(cluster['entities'])
                        matched = True
                        break
                        
                if not matched:
                    clusters.append({
                        'x_center': x_center,
                        'x_min': ent.bbox.x0,
                        'x_max': ent.bbox.x1,
                        'type': ent.entity_type,
                        'entities': [ent]
                    })
                    
            # For any cluster with >= 2 entities, we assume it's a PII column
            for cluster in clusters:
                if len(cluster['entities']) >= 2: # At least two solid detections form a column
                    # Find all blocks that fall inside this horizontal column
                    # and are NOT already covered by an entity
                    col_x_min = cluster['x_min'] - 20 # Allow some padding for misalignment
                    col_x_max = cluster['x_max'] + 20
                    
                    for block in page_blocks:
                        b_x_center = (block.bbox.x0 + block.bbox.x1) / 2
                        
                        # If block's center is inside the column
                        if col_x_min <= b_x_center <= col_x_max:
                            # Skip empty blocks or pure headers (simple heuristic: if it's the very top of the column)
                            if not block.text.strip():
                                continue
                                
                            # Check if already covered by ANY entity in the document
                            is_covered = False
                            for e in page_entities:
                                # vertical overlap
                                if max(e.bbox.y0, block.bbox.y0) < min(e.bbox.y1, block.bbox.y1):
                                    # horizontal overlap
                                    if max(e.bbox.x0, block.bbox.x0) < min(e.bbox.x1, block.bbox.x1):
                                        is_covered = True
                                        break
                                        
                            if not is_covered:
                                # Create a new entity for this block!
                                new_ent = RedactionEntity(
                                    id=str(uuid.uuid4()),
                                    entity_type=f"INFERRED_{cluster['type']}",
                                    text=block.text.strip(),
                                    score=0.85, # Assign a high score since tabular locality is a strong indicator
                                    page_num=page_num,
                                    bbox=block.bbox,
                                    start_index=block.start_index,
                                    end_index=block.end_index,
                                    status="pending"
                                )
                                new_entities.append(new_ent)
                                page_entities.append(new_ent)
                                cluster['entities'].append(new_ent)
                                
        return new_entities
