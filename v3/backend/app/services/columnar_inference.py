import re
import uuid
from typing import List, Dict, Any, Optional, Tuple
from app.schemas.document import CanonicalDocument, CanonicalBlock, RedactionEntity, BoundingBox
from app.services.indian_pii import is_valid_aadhaar, is_valid_pan

# Map of table header keywords to target PII entity types
HEADER_KEYWORD_MAP = {
    # Aadhaar
    "aadhaar": "AADHAAR_NUMBER",
    "aadhar": "AADHAAR_NUMBER",
    "uid": "AADHAAR_NUMBER",
    "aadhaar number": "AADHAAR_NUMBER",
    "aadhaar no": "AADHAAR_NUMBER",
    "aadhar no": "AADHAAR_NUMBER",
    
    # PAN
    "pan": "PAN_NUMBER",
    "pan number": "PAN_NUMBER",
    "pan no": "PAN_NUMBER",
    "permanent account number": "PAN_NUMBER",
    "pan card": "PAN_NUMBER",
    
    # Bank Account
    "bank account": "BANK_ACCOUNT",
    "account number": "BANK_ACCOUNT",
    "salary account": "BANK_ACCOUNT",
    "a/c no": "BANK_ACCOUNT",
    "account no": "BANK_ACCOUNT",
    "ref / account": "BANK_ACCOUNT",
    "bank acct": "BANK_ACCOUNT",
    "acct no": "BANK_ACCOUNT",
    "account": "BANK_ACCOUNT",
    
    # IFSC
    "ifsc": "IFSC_CODE",
    "ifsc code": "IFSC_CODE",
    
    # Person
    "name": "PERSON",
    "emp name": "PERSON",
    "employee name": "PERSON",
    "candidate name": "PERSON",
    "account holder": "PERSON",
    "holder name": "PERSON",
    "customer name": "PERSON",
    
    # Phone
    "phone": "PHONE_NUMBER",
    "mobile": "PHONE_NUMBER",
    "contact": "PHONE_NUMBER",
    "mobile no": "PHONE_NUMBER",
    "phone number": "PHONE_NUMBER",
    
    # Email
    "email": "EMAIL_ADDRESS",
    "email id": "EMAIL_ADDRESS",
    "email address": "EMAIL_ADDRESS",
}

# Non-PII column headers that must NEVER be treated as PII columns
NON_PII_HEADER_KEYWORDS = {
    "emp id", "employee id", "id", "item", "description", "item description",
    "qty", "quantity", "rate", "price", "amount", "debit", "credit",
    "net salary", "salary", "gross salary", "tax", "gst", "total",
    "designation", "role", "dept", "department", "date", "txn date",
    "transaction date", "status", "remarks", "serial", "s.no", "sl no", "sr no"
}


class ColumnarInferenceEngine:
    """
    Analyzes table structure and spatial layout to propagate column context
    from verified headers down to cell records without cross-column bleeding.
    """

    @staticmethod
    def normalize_header(header_text: str) -> Optional[str]:
        """
        Maps a column header text to a canonical PII entity type.
        Returns None if header is non-PII or unrecognized.
        """
        clean = re.sub(r'[\r\n\t|]', ' ', header_text.strip().lower())
        clean = re.sub(r'\s+', ' ', clean).strip()
        
        # Explicit non-PII filter
        if clean in NON_PII_HEADER_KEYWORDS:
            return None
            
        # Exact match in keyword map
        if clean in HEADER_KEYWORD_MAP:
            return HEADER_KEYWORD_MAP[clean]
            
        # Substring search for compound headers (e.g. "Column: Aadhaar Number")
        for kw, etype in HEADER_KEYWORD_MAP.items():
            pattern = r'\b' + re.escape(kw) + r'\b'
            if re.search(pattern, clean):
                return etype
                
        return None

    @staticmethod
    def validate_cell_content(entity_type: str, cell_text: str) -> bool:
        """
        Validates that a cell's candidate text matches the required mathematical
        or syntactic structure for the propagated entity type.
        Prevents arbitrary text/numbers from becoming false positives.
        """
        clean = cell_text.strip()
        if not clean:
            return False

        if entity_type == "AADHAAR_NUMBER":
            digits = re.sub(r'\D', '', clean)
            if len(digits) == 12:
                # Verhoeff validation or valid 4-4-4 formatted structure
                return is_valid_aadhaar(clean) or bool(re.match(r'^\d{4}[\s-]?\d{4}[\s-]?\d{4}$', clean))
            return False

        elif entity_type == "PAN_NUMBER":
            clean_upper = clean.replace(" ", "").upper()
            return bool(re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', clean_upper))

        elif entity_type == "BANK_ACCOUNT":
            # Must be strictly 9 to 18 digits; decimals, currencies, or symbols reject
            if '.' in clean or ',' in clean or '/' in clean or '$' in clean or '€' in clean:
                return False
            digits = re.sub(r'[\s-]', '', clean)
            return bool(re.match(r'^\d{9,18}$', digits))

        elif entity_type == "IFSC_CODE":
            clean_upper = clean.replace(" ", "").upper()
            return bool(re.match(r'^[A-Z]{4}0[A-Z0-9]{6}$', clean_upper))

        elif entity_type == "PHONE_NUMBER":
            digits = re.sub(r'\D', '', clean)
            return len(digits) in (10, 11, 12) and bool(re.search(r'[6-9]\d{9}$', digits))

        elif entity_type == "EMAIL_ADDRESS":
            return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', clean))

        elif entity_type == "PERSON":
            # Disqualify if it contains digits, amounts, currencies, or common status codes
            if re.search(r'\d', clean) or clean.upper() in ["ACTIVE", "INACTIVE", "PENDING", "APPROVED", "VERIFIED"]:
                return False
            words = clean.split()
            # Valid person name: 1 to 4 capitalized words (or Devanagari script)
            has_devanagari = any('\u0900' <= char <= '\u097F' for char in clean)
            if has_devanagari:
                return 1 <= len(words) <= 4
            return 1 <= len(words) <= 4 and all(w[0].isupper() for w in words if w and w[0].isalpha())

        return False

    @classmethod
    def infer_text_tables(cls, full_text: str) -> List[Dict[str, Any]]:
        """
        Parses pipe-delimited or tab-delimited text tables.
        Identifies header rows, maps columns to PII types, and propagates context
        strictly down each column to structurally valid cell candidates.
        """
        inferred = []
        lines = full_text.split('\n')
        
        current_offset = 0
        active_table_columns = None # Dict[int, str]: col_idx -> entity_type
        active_table_col_names = None
        
        for line in lines:
            line_len = len(line)
            line_start = current_offset
            line_end = line_start + line_len
            current_offset += line_len + 1 # +1 for \n

            stripped = line.strip()
            if not stripped:
                # Blank line breaks active table context
                active_table_columns = None
                active_table_col_names = None
                continue

            # Determine delimiter: pipe or tab
            delimiter = None
            if '|' in line:
                delimiter = '|'
            elif '\t' in line:
                delimiter = '\t'

            if not delimiter:
                # Non-tabular line resets table context
                active_table_columns = None
                active_table_col_names = None
                continue

            raw_cells = line.split(delimiter)
            # Must have at least 2 columns to be considered a table
            if len(raw_cells) < 2:
                active_table_columns = None
                active_table_col_names = None
                continue

            # Check if this line is a table header row
            candidate_col_types = {}
            candidate_col_names = {}
            for col_idx, raw_cell in enumerate(raw_cells):
                cell_str = raw_cell.strip()
                etype = cls.normalize_header(cell_str)
                if etype:
                    candidate_col_types[col_idx] = etype
                    candidate_col_names[col_idx] = cell_str

            # If line has at least one recognized PII header or table column header
            has_known_headers = any(
                cls.normalize_header(c.strip()) is not None or c.strip().lower() in NON_PII_HEADER_KEYWORDS
                for c in raw_cells
            )

            if has_known_headers and len(candidate_col_types) > 0:
                # Start / reset active table context with this header
                active_table_columns = candidate_col_types
                active_table_col_names = candidate_col_names
                continue

            # If we are inside an active table, process data cells
            if active_table_columns:
                # Calculate exact character offsets for each cell in this line
                col_start = 0
                for col_idx, raw_cell in enumerate(raw_cells):
                    cell_len = len(raw_cell)
                    cell_global_start = line_start + col_start
                    cell_global_end = cell_global_start + cell_len
                    col_start += cell_len + 1 # +1 for delimiter

                    target_entity_type = active_table_columns.get(col_idx)
                    if not target_entity_type:
                        continue

                    cell_clean = raw_cell.strip()
                    if not cell_clean:
                        continue

                    # Validate candidate against target PII structural rules
                    if cls.validate_cell_content(target_entity_type, cell_clean):
                        # Find exact position of trimmed cell inside raw_cell
                        trim_offset = raw_cell.find(cell_clean)
                        exact_start = cell_global_start + trim_offset
                        exact_end = exact_start + len(cell_clean)

                        inferred.append({
                            "entity_type": target_entity_type,
                            "text": cell_clean,
                            "start": exact_start,
                            "end": exact_end,
                            "score": 0.85,
                            "metadata": {
                                "context_source": "columnar_header",
                                "header_text": active_table_col_names.get(col_idx, "unknown"),
                                "column_index": col_idx,
                                "inferred": True
                            }
                        })

        return inferred

    @classmethod
    def run_inference(cls, doc: CanonicalDocument, entities: List[RedactionEntity]) -> List[RedactionEntity]:
        """
        Executes layout-aware columnar context propagation across canonical document blocks.
        Preserves existing valid detections, applies header-guided column propagation,
        and enforces strict cell candidate structural validation.
        """
        # Step 1: Text-level table parsing on full_text
        text_inferred = cls.infer_text_tables(doc.full_text)
        
        new_entities = list(entities)
        existing_spans = {(e.start_index, e.end_index) for e in entities if e.start_index is not None and e.end_index is not None}
        
        # Add text-inferred entities mapped to blocks
        for inf in text_inferred:
            span = (inf["start"], inf["end"])
            # Check if an existing detection overlapped
            overlapping_ent = None
            for e in new_entities:
                if e.start_index is not None and e.end_index is not None:
                    if max(span[0], e.start_index) < min(span[1], e.end_index):
                        overlapping_ent = e
                        break

            if overlapping_ent is not None:
                # If existing entity was misclassified as generic type (e.g. PHONE_NUMBER or DATE_TIME)
                # and column header specifically denotes a structured type (e.g. AADHAAR_NUMBER, BANK_ACCOUNT)
                if overlapping_ent.entity_type in ["PHONE_NUMBER", "DATE_TIME", "O", "UNKNOWN", "DATE_OF_BIRTH"] and \
                   inf["entity_type"] in ["AADHAAR_NUMBER", "BANK_ACCOUNT", "PAN_NUMBER", "IFSC_CODE"]:
                    overlapping_ent.entity_type = inf["entity_type"]
                continue

            # Find containing block
            matched_block = None
            if doc.blocks:
                for b in doc.blocks:
                    if b.start_index <= span[0] and b.end_index >= span[1]:
                        matched_block = b
                        break

            bbox = None
            page_num = 1
            if matched_block:
                page_num = matched_block.page_num
                if matched_block.bbox and matched_block.start_index < matched_block.end_index:
                    visible_len = max(len(matched_block.text.rstrip('\n')), 1)
                    char_w = (matched_block.bbox.x1 - matched_block.bbox.x0) / visible_len
                    rel_s = span[0] - matched_block.start_index
                    rel_e = min(span[1] - matched_block.start_index, visible_len)
                    bbox = BoundingBox(
                        x0=max(matched_block.bbox.x0, matched_block.bbox.x0 + (rel_s * char_w) - 1),
                        y0=matched_block.bbox.y0,
                        x1=min(matched_block.bbox.x1, matched_block.bbox.x0 + (rel_e * char_w) + 2),
                        y1=matched_block.bbox.y1
                    )

            inferred_ent = RedactionEntity(
                id=str(uuid.uuid4()),
                entity_type=inf["entity_type"],
                text=inf["text"],
                score=inf["score"],
                page_num=page_num,
                bbox=bbox,
                start_index=span[0],
                end_index=span[1],
                status="pending"
            )
            new_entities.append(inferred_ent)
            existing_spans.add(span)

        # Step 2: Spatial Layout Columnar Propagation for PDF/Image bounding boxes
        if not doc.blocks or not doc.blocks[0].bbox:
            return new_entities

        for page_num in range(1, doc.page_count + 1):
            page_blocks = [b for b in doc.blocks if b.page_num == page_num and b.bbox]
            page_entities = [e for e in new_entities if e.page_num == page_num and e.bbox]

            # Find table header rows on this page: blocks containing recognized column headers
            header_columns = [] # List[dict]: {x0, x1, entity_type, header_text, y0, y1}
            for b in page_blocks:
                etype = cls.normalize_header(b.text)
                if etype:
                    header_columns.append({
                        "x0": b.bbox.x0,
                        "x1": b.bbox.x1,
                        "y0": b.bbox.y0,
                        "y1": b.bbox.y1,
                        "entity_type": etype,
                        "header_text": b.text.strip()
                    })

            # For each header column on this page, scan candidate blocks strictly below it
            for col in header_columns:
                col_x0 = col["x0"] - 15.0 # Tolerance for column cell alignment
                col_x1 = col["x1"] + 15.0
                min_y = col["y1"] # Below the header line

                for block in page_blocks:
                    # Must be vertically below header
                    if block.bbox.y0 <= min_y:
                        continue

                    # Horizontal center must align within column
                    b_x_center = (block.bbox.x0 + block.bbox.x1) / 2.0
                    if not (col_x0 <= b_x_center <= col_x1):
                        continue

                    # Ambiguity gate: If block width spans significantly beyond the column width, reject (e.g. merged cell or footnote)
                    if (block.bbox.x1 - block.bbox.x0) > (col["x1"] - col["x0"]) * 2.2:
                        continue

                    # Check if already covered by an existing entity
                    is_covered = False
                    for ent in page_entities:
                        # 2D overlap
                        if max(ent.bbox.x0, block.bbox.x0) < min(ent.bbox.x1, block.bbox.x1) and \
                           max(ent.bbox.y0, block.bbox.y0) < min(ent.bbox.y1, block.bbox.y1):
                            is_covered = True
                            break

                    if is_covered:
                        continue

                    cell_clean = block.text.strip()
                    # Candidate structure validation: Must be structurally valid for this column's PII type
                    if cls.validate_cell_content(col["entity_type"], cell_clean):
                        new_ent = RedactionEntity(
                            id=str(uuid.uuid4()),
                            entity_type=col["entity_type"],
                            text=cell_clean,
                            score=0.85,
                            page_num=page_num,
                            bbox=block.bbox,
                            start_index=block.start_index,
                            end_index=block.end_index,
                            status="pending"
                        )
                        new_entities.append(new_ent)
                        page_entities.append(new_ent)

        return new_entities
