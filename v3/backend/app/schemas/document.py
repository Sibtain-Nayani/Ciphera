from pydantic import BaseModel
from typing import List, Dict, Optional, Any

class BoundingBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float

class CanonicalBlock(BaseModel):
    page_num: int
    text: str
    bbox: Optional[BoundingBox] = None
    block_type: str = "text" # e.g. text, image, table
    start_index: int = 0
    end_index: int = 0

class CanonicalDocument(BaseModel):
    metadata: Dict[str, Any]
    blocks: List[CanonicalBlock]
    full_text: str
    page_count: int

class RedactionEntity(BaseModel):
    id: str
    entity_type: str
    text: str
    score: float
    page_num: int
    bbox: Optional[BoundingBox] = None
    start_index: Optional[int] = None
    end_index: Optional[int] = None
    status: str = "pending" # pending, accepted, rejected, modified
