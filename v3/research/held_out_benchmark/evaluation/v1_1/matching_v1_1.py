"""
Deterministic Dual-Channel Bipartite Matching Engine (Evaluator v1.1 - Stage 7A.1)

Author: Google Deepmind Agentic Coding Team
Version: 1.1.1-held-out-evaluator
Sealed Against: f77567d3d7b5106895305f64a1aee6aeed635692

Audit Corrections in v1.1.1:
1. Strengthened Fragmented OCR Token Merging:
   - Evaluates combinations of 2 or 3 candidate boxes localized within the target entity envelope.
   - Neighbor Protection Check: strictly rejects any candidate box that overlaps a neighboring expected entity,
     preventing the absorption of adjacent identifiers.
   - Ambiguity Gate: If a candidate group could match multiple expected entities, it remains unmatched / ambiguous.
2. Conservative OCR Confusion Gating:
   - Transparent, recorded confusion pairs: (O/0), (I/1), (l/1), (S/5), (Z/2), (B/8).
   - Distance calculation records exact substitutions.
   - Token length thresholding: For tokens <= 6 characters, max allowable edit distance is strictly 1.
3. Enhanced Spatial Bounding Box & Page Validation:
   - Strict rejection of missing, inverted (x0>=x1, y0>=y1), negative, or NaN coordinates.
   - Cross-page matching is impossible (strict page_num equality required).
4. Duplicate Logging:
   - Extra overlapping detections are flagged as duplicate_of, while remaining fully counted as false positives
     in conventional metric accounting.
"""

from typing import List, Dict, Any, Tuple, Optional, Set
import math
import re
import itertools


# Explicit OCR character confusion pairs (bidirectional)
OCR_CONFUSION_PAIRS = {
    ('O', '0'), ('0', 'O'),
    ('o', '0'), ('0', 'o'),
    ('I', '1'), ('1', 'I'),
    ('l', '1'), ('1', 'l'),
    ('i', '1'), ('1', 'i'),
    ('S', '5'), ('5', 'S'),
    ('s', '5'), ('5', 's'),
    ('Z', '2'), ('2', 'Z'),
    ('z', '2'), ('2', 'z'),
    ('B', '8'), ('8', 'B'),
}

# Structured / high-entropy identifier types where non-confusion character differences must strictly reject
STRUCTURED_IDENTIFIER_TYPES = {
    "PAN_NUMBER",
    "AADHAAR_NUMBER",
    "IFSC_CODE",
    "BANK_ACCOUNT",
    "PASSPORT_NUMBER",
    "VOTER_ID",
    "PHONE_NUMBER",
    "DATE_OF_BIRTH",
    "EMAIL_ADDRESS",
    "TAX_ID",
    "CREDIT_CARD",
    "DRIVING_LICENSE",
    "VEHICLE_REGISTRATION",
}


def calculate_1d_iou(start1: int, end1: int, start2: int, end2: int) -> float:
    """Computes 1D intersection over union between two character spans."""
    if start1 < 0 or start2 < 0 or end1 <= start1 or end2 <= start2:
        return 0.0
    intersection = max(0, min(end1, end2) - max(start1, start2))
    union = max(end1, end2) - min(start1, start2)
    return float(intersection) / float(union) if union > 0 else 0.0


def calculate_span_intersection_length(start1: int, end1: int, start2: int, end2: int) -> int:
    """Computes the length of the overlapping character span between two ranges."""
    if start1 < 0 or start2 < 0 or end1 <= start1 or end2 <= start2:
        return 0
    return max(0, min(end1, end2) - max(start1, start2))


def normalize_bbox(raw_bbox: Any) -> Optional[List[float]]:
    """
    Validates and normalizes bounding box into [x0, y0, x1, y1].
    Returns None if bbox is invalid, missing, or has zero/negative dimensions.
    """
    if raw_bbox is None:
        return None
    
    if isinstance(raw_bbox, dict):
        x0 = raw_bbox.get("x0")
        y0 = raw_bbox.get("y0")
        x1 = raw_bbox.get("x1")
        y1 = raw_bbox.get("y1")
    elif isinstance(raw_bbox, (list, tuple)) and len(raw_bbox) == 4:
        x0, y0, x1, y1 = raw_bbox
    else:
        return None

    try:
        x0, y0, x1, y1 = float(x0), float(y0), float(x1), float(y1)
    except (TypeError, ValueError):
        return None

    if math.isnan(x0) or math.isnan(y0) or math.isnan(x1) or math.isnan(y1):
        return None

    # Coordinate ordering check
    if x0 >= x1 or y0 >= y1:
        return None
    if x0 < 0 or y0 < 0:
        return None

    return [x0, y0, x1, y1]


def calculate_2d_iou(box1: List[float], box2: List[float]) -> float:
    """Computes 2D IoU between two validated bounding boxes [x0, y0, x1, y1]."""
    inter_x0 = max(box1[0], box2[0])
    inter_y0 = max(box1[1], box2[1])
    inter_x1 = min(box1[2], box2[2])
    inter_y1 = min(box1[3], box2[3])

    inter_w = max(0.0, inter_x1 - inter_x0)
    inter_h = max(0.0, inter_y1 - inter_y0)
    inter_area = inter_w * inter_h

    area1 = max(0.0, box1[2] - box1[0]) * max(0.0, box1[3] - box1[1])
    area2 = max(0.0, box2[2] - box2[0]) * max(0.0, box2[3] - box2[1])
    union_area = area1 + area2 - inter_area

    return inter_area / union_area if union_area > 0.0 else 0.0


def calculate_box_containment_ratio(inner_box: List[float], outer_box: List[float]) -> float:
    """Computes what fraction of inner_box is contained within outer_box."""
    inter_x0 = max(inner_box[0], outer_box[0])
    inter_y0 = max(inner_box[1], outer_box[1])
    inter_x1 = min(inner_box[2], outer_box[2])
    inter_y1 = min(inner_box[3], outer_box[3])

    inter_w = max(0.0, inter_x1 - inter_x0)
    inter_h = max(0.0, inter_y1 - inter_y0)
    inter_area = inter_w * inter_h

    inner_area = max(0.0, inner_box[2] - inner_box[0]) * max(0.0, inner_box[3] - inner_box[1])
    return inter_area / inner_area if inner_area > 0.0 else 0.0


def union_bboxes(bboxes: List[List[float]]) -> Optional[List[float]]:
    """Computes the minimal bounding box enclosing all input bboxes."""
    valid_boxes = [b for b in bboxes if b is not None]
    if not valid_boxes:
        return None
    x0 = min(b[0] for b in valid_boxes)
    y0 = min(b[1] for b in valid_boxes)
    x1 = max(b[2] for b in valid_boxes)
    y1 = max(b[3] for b in valid_boxes)
    return [x0, y0, x1, y1]


def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes standard edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def normalize_for_text_matching(s: str) -> str:
    """Strips whitespace, hyphens, and standard separators for identifier matching."""
    if not s:
        return ""
    return re.sub(r'[\s\-_/\\.:,]', '', s).upper()


def calculate_ocr_aware_distance(s1: str, s2: str) -> Tuple[int, List[str]]:
    """
    Computes edit distance allowing recorded character confusion pairs with 0 cost penalty.
    Returns: (effective_edit_distance, applied_rules)
    """
    norm1 = normalize_for_text_matching(s1)
    norm2 = normalize_for_text_matching(s2)

    if norm1 == norm2:
        return 0, []

    # Map identical length strings with character confusions
    applied_rules = []
    if len(norm1) == len(norm2):
        diff_count = 0
        for c1, c2 in zip(norm1, norm2):
            if c1 == c2:
                continue
            if (c1, c2) in OCR_CONFUSION_PAIRS:
                applied_rules.append(f"{c1}->{c2}")
            else:
                diff_count += 1
        return diff_count, applied_rules

    # General Levenshtein distance
    dist = levenshtein_distance(norm1, norm2)
    return dist, applied_rules


def solve_max_weight_bipartite(weight_matrix: List[List[float]]) -> List[Tuple[int, int]]:
    """
    Solves deterministic maximum-weight bipartite assignment via Kuhn-Munkres.
    """
    if not weight_matrix or not weight_matrix[0]:
        return []

    n_rows = len(weight_matrix)
    n_cols = len(weight_matrix[0])
    dim = max(n_rows, n_cols)

    max_weight = 0.0
    for r in range(n_rows):
        for c in range(n_cols):
            if weight_matrix[r][c] > max_weight:
                max_weight = weight_matrix[r][c]

    scale = 10000.0
    cost = [[int(round(max_weight * scale))] * dim for _ in range(dim)]
    for r in range(n_rows):
        for c in range(n_cols):
            w = weight_matrix[r][c]
            if w > 0.0:
                cost[r][c] = int(round((max_weight - w) * scale))

    u = [0] * (dim + 1)
    v = [0] * (dim + 1)
    p = [0] * (dim + 1)
    way = [0] * (dim + 1)

    for i in range(1, dim + 1):
        p[0] = i
        j0 = 0
        minv = [float('inf')] * (dim + 1)
        used = [False] * (dim + 1)

        while True:
            used[j0] = True
            i0 = p[j0]
            delta = float('inf')
            j1 = 0

            for j in range(1, dim + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j] = cur
                        way[j] = j0
                    if minv[j] < delta:
                        delta = minv[j]
                        j1 = j

            for j in range(0, dim + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta

            j0 = j1
            if p[j0] == 0:
                break

        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break

    matched_pairs = []
    for j in range(1, dim + 1):
        i = p[j]
        if i > 0:
            row = i - 1
            col = j - 1
            if row < n_rows and col < n_cols:
                if weight_matrix[row][col] > 0.0:
                    matched_pairs.append((row, col))

    matched_pairs.sort(key=lambda x: (x[0], x[1]))
    return matched_pairs


def match_entities_bipartite_v1_1(
    expected_list: List[Dict[str, Any]],
    detected_list: List[Dict[str, Any]],
    char_iou_threshold: float = 0.50,
    spatial_iou_threshold: float = 0.40,
    max_edit_distance: int = 2
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Evaluator v1.1 Master Dual-Channel Bipartite Matching Function.
    
    Channels:
    - Channel 1 (Native Digital): Evaluates character span IoU >= char_iou_threshold.
    - Channel 2 (OCR-Derived): Evaluates Page-Aware 2D Bbox IoU >= spatial_iou_threshold
      AND conservative normalized string similarity.
    """
    # 1. Initialize and validate expected entities
    for idx, e in enumerate(expected_list):
        e["matched_by"] = None
        e["is_exact_match"] = False
        e["match_iou"] = 0.0
        e["match_method"] = "unmatched"
        e["match_channel"] = "ocr_spatial" if e.get("is_ocr_derived", False) else "digital_span"
        e["residual_characters"] = len(e.get("value", "") or "")
        e["incomplete_span"] = False
        e["rejection_diagnostics"] = []
        if "id" not in e:
            e["id"] = f"exp_{idx}"
        
        # Coordinate normalization
        e["norm_bbox"] = normalize_bbox(e.get("bbox"))
        e["page_num"] = int(e.get("page_num", 1) or 1)

    # 2. Initialize and validate detected entities
    for idx, d in enumerate(detected_list):
        d["matched_to"] = None
        d["is_exact_match"] = False
        d["match_iou"] = 0.0
        d["match_method"] = "unmatched"
        d["duplicate_of"] = None
        d["rejection_diagnostics"] = []
        if "id" not in d:
            d["id"] = f"det_{idx}"

        d["norm_bbox"] = normalize_bbox(d.get("bbox"))
        d["page_num"] = int(d.get("page_num", 1) or 1)

    n_exp = len(expected_list)
    n_det = len(detected_list)

    if n_exp == 0 or n_det == 0:
        return expected_list, detected_list

    # Deterministic sorting before matrix generation
    indexed_exp = sorted(
        list(enumerate(expected_list)),
        key=lambda x: (
            x[1]["page_num"],
            x[1]["norm_bbox"][1] if x[1]["norm_bbox"] else 0.0,
            x[1]["norm_bbox"][0] if x[1]["norm_bbox"] else 0.0,
            x[1].get("start", 0) if x[1].get("start") is not None else 0,
            x[1]["id"]
        )
    )
    indexed_det = sorted(
        list(enumerate(detected_list)),
        key=lambda x: (
            x[1]["page_num"],
            x[1]["norm_bbox"][1] if x[1]["norm_bbox"] else 0.0,
            x[1]["norm_bbox"][0] if x[1]["norm_bbox"] else 0.0,
            x[1].get("start", 0) if x[1].get("start") is not None else 0,
            x[1]["id"]
        )
    )

    weight_matrix = [[0.0] * n_det for _ in range(n_exp)]
    affinity_metadata: Dict[Tuple[int, int], Dict[str, Any]] = {}

    for orig_i, e in indexed_exp:
        is_ocr = e.get("is_ocr_derived", False)
        e_type = e.get("type")
        e_val = e.get("value", "") or ""
        e_page = e["page_num"]

        for orig_j, d in indexed_det:
            d_type = d.get("type")
            d_val = d.get("value", "") or ""
            d_page = d["page_num"]

            # Gate 1: Type compatibility
            if e_type != d_type:
                continue

            # Gate 2: Page compatibility
            if e_page != d_page:
                continue

            # Dual-Channel branching
            if not is_ocr:
                # Channel 1: Native Digital Text
                e_start = e.get("start")
                e_end = e.get("end")
                d_start = d.get("start")
                d_end = d.get("end")

                # Reject missing or placeholder spans
                if e_start is None or e_end is None or d_start is None or d_end is None:
                    continue
                if e_start < 0 or d_start < 0 or e_end <= e_start or d_end <= d_start:
                    continue

                span_iou = calculate_1d_iou(e_start, e_end, d_start, d_end)
                if span_iou >= char_iou_threshold:
                    weight_matrix[orig_i][orig_j] = 1.0 + span_iou
                    affinity_metadata[(orig_i, orig_j)] = {
                        "channel": "digital_span",
                        "iou": span_iou,
                        "exact": (e_start == d_start and e_end == d_end),
                        "edit_dist": 0,
                        "method": "exact_character_span" if (e_start == d_start and e_end == d_end) else "overlap_character_span"
                    }
            else:
                # Channel 2: OCR-Derived Document
                e_box = e["norm_bbox"]
                d_box = d["norm_bbox"]

                # Coordinate validation
                if e_box is None or d_box is None:
                    continue

                bbox_iou = calculate_2d_iou(e_box, d_box)
                if bbox_iou < spatial_iou_threshold:
                    continue

                # Normalized string similarity gating
                edit_dist, applied_rules = calculate_ocr_aware_distance(e_val, d_val)
                norm_len = max(len(normalize_for_text_matching(e_val)), len(normalize_for_text_matching(d_val)))
                
                # For structured identifiers, non-confusion character differences are rejected (effective_max_ed = 0).
                # For unstructured text tokens, allow conservative edit distance (1 for <=6 chars, else max_edit_distance).
                if e_type in STRUCTURED_IDENTIFIER_TYPES:
                    effective_max_ed = 0
                else:
                    effective_max_ed = 1 if norm_len <= 6 else max_edit_distance

                if edit_dist > effective_max_ed:
                    continue

                # Valid spatial match weight
                weight_matrix[orig_i][orig_j] = 1.0 + bbox_iou + (1.0 - (float(edit_dist) / max(1, norm_len)))
                affinity_metadata[(orig_i, orig_j)] = {
                    "channel": "ocr_spatial",
                    "iou": bbox_iou,
                    "exact": (edit_dist == 0 and bbox_iou >= 0.85),
                    "edit_dist": edit_dist,
                    "confusion_rules": applied_rules,
                    "method": "spatial_bbox_iou"
                }

    # Solve optimal one-to-one assignment
    pairs = solve_max_weight_bipartite(weight_matrix)

    matched_e_indices = set()
    matched_d_indices = set()

    for i, j in pairs:
        e = expected_list[i]
        d = detected_list[j]
        meta = affinity_metadata.get((i, j), {})

        e["matched_by"] = j
        e["match_iou"] = meta.get("iou", 0.0)
        e["is_exact_match"] = meta.get("exact", False)
        e["match_method"] = meta.get("method", "unmatched")
        
        d["matched_to"] = i
        d["match_iou"] = meta.get("iou", 0.0)
        d["is_exact_match"] = meta.get("exact", False)
        d["match_method"] = meta.get("method", "unmatched")

        # Residual calculation
        if meta.get("channel") == "digital_span":
            inter_len = calculate_span_intersection_length(e["start"], e["end"], d["start"], d["end"])
            val_len = len(e.get("value", "") or "")
            residual = max(0, val_len - inter_len)
            e["residual_characters"] = residual
            e["incomplete_span"] = (residual > 0)
        else:
            e["residual_characters"] = meta.get("edit_dist", 0)
            e["incomplete_span"] = (meta.get("edit_dist", 0) > 0)

        matched_e_indices.add(i)
        matched_d_indices.add(j)

    # 3. Handle Conservative Fragmented OCR Token Merging for Unmatched OCR Entities
    # Strictly with Neighbor Protection & Ambiguity Gating
    other_expected_boxes = {
        i: e["norm_bbox"] for i, e in enumerate(expected_list)
        if e.get("norm_bbox") is not None
    }

    for i, e in enumerate(expected_list):
        if i in matched_e_indices or not e.get("is_ocr_derived", False):
            continue
        e_box = e.get("norm_bbox")
        e_type = e.get("type")
        e_val = e.get("value", "") or ""
        e_page = e.get("page_num", 1)

        if e_box is None:
            continue

        # Look for unmatched candidate detections on the same page with compatible type
        unmatched_candidates = [
            (j, d) for j, d in enumerate(detected_list)
            if j not in matched_d_indices
            and d.get("page_num") == e_page
            and d.get("type") == e_type
            and d.get("norm_bbox") is not None
        ]

        if len(unmatched_candidates) < 2:
            continue

        # Filter candidate boxes that overlap e_box
        relevant_cands = []
        for j, d in unmatched_candidates:
            d_box = d["norm_bbox"]
            containment = calculate_box_containment_ratio(d_box, e_box)
            if containment >= 0.50 or calculate_2d_iou(d_box, e_box) >= 0.20:
                # NEIGHBOR PROTECTION CHECK:
                # Candidate box must NOT overlap any other expected entity on this page!
                absorbed_neighbor = False
                for other_i, other_box in other_expected_boxes.items():
                    if other_i != i and expected_list[other_i]["page_num"] == e_page:
                        other_containment = calculate_box_containment_ratio(d_box, other_box)
                        if other_containment >= 0.25 or calculate_2d_iou(d_box, other_box) >= 0.20:
                            absorbed_neighbor = True
                            break
                if not absorbed_neighbor:
                    relevant_cands.append((j, d))

        # Test combinations of 2 or 3 candidate fragments
        best_merge_combo = None
        best_merge_iou = 0.0

        for k in (2, 3):
            if len(relevant_cands) < k:
                continue
            for combo in itertools.combinations(relevant_cands, k):
                c_boxes = [d["norm_bbox"] for _, d in combo]
                union_box = union_bboxes(c_boxes)
                if not union_box:
                    continue
                
                iou = calculate_2d_iou(e_box, union_box)
                if iou >= spatial_iou_threshold:
                    # Sort candidates horizontally
                    sorted_combo = sorted(combo, key=lambda x: x[1]["norm_bbox"][0])
                    merged_val = "".join(d.get("value", "") or "" for _, d in sorted_combo)
                    dist, applied_rules = calculate_ocr_aware_distance(e_val, merged_val)
                    norm_len = max(len(normalize_for_text_matching(e_val)), len(normalize_for_text_matching(merged_val)))

                    if e_type in STRUCTURED_IDENTIFIER_TYPES:
                        effective_max_ed = 0
                    else:
                        effective_max_ed = 1 if norm_len <= 6 else max_edit_distance

                    if dist <= effective_max_ed:
                        if iou > best_merge_iou:
                            best_merge_iou = iou
                            best_merge_combo = (sorted_combo, union_box, dist)

        if best_merge_combo is not None:
            sorted_combo, union_box, dist = best_merge_combo
            
            # AMBIGUITY CHECK: ensure this union doesn't equally match another unmatched expected entity
            is_ambiguous = False
            for other_i, other_e in enumerate(expected_list):
                if other_i != i and other_i not in matched_e_indices and other_e.get("norm_bbox") is not None:
                    other_box = other_e["norm_bbox"]
                    if calculate_2d_iou(other_box, union_box) >= spatial_iou_threshold:
                        is_ambiguous = True
                        break

            if not is_ambiguous:
                e["matched_by"] = [j for j, _ in sorted_combo]
                e["match_iou"] = best_merge_iou
                e["match_method"] = "spatial_fragment_merged"
                e["is_exact_match"] = (dist == 0 and best_merge_iou >= 0.85)
                e["residual_characters"] = dist
                e["incomplete_span"] = (dist > 0)
                matched_e_indices.add(i)

                for j, _ in sorted_combo:
                    detected_list[j]["matched_to"] = i
                    detected_list[j]["match_method"] = "spatial_fragment_merged"
                    detected_list[j]["match_iou"] = best_merge_iou
                    matched_d_indices.add(j)

    # 4. Duplicate Detections Identification
    # NOTE: Duplicates remain unassigned (matched_to = None) and are counted in conventional FP
    for j1, d1 in enumerate(detected_list):
        if d1["matched_to"] is None:
            best_dup_iou = 0.0
            best_dup_target = None
            for j2, d2 in enumerate(detected_list):
                if j1 != j2 and d2["matched_to"] is not None and d1["type"] == d2["type"] and d1["page_num"] == d2["page_num"]:
                    if d1["norm_bbox"] and d2["norm_bbox"]:
                        dup_iou = calculate_2d_iou(d1["norm_bbox"], d2["norm_bbox"])
                    elif d1.get("start") is not None and d2.get("start") is not None:
                        dup_iou = calculate_1d_iou(d1["start"], d1["end"], d2["start"], d2["end"])
                    else:
                        dup_iou = 0.0
                    
                    if dup_iou > best_dup_iou:
                        best_dup_iou = dup_iou
                        best_dup_target = j2

            if best_dup_iou >= spatial_iou_threshold:
                d1["duplicate_of"] = best_dup_target

    return expected_list, detected_list
