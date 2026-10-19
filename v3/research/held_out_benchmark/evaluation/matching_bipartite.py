"""
Deterministic Maximum-Weight Bipartite Matching Engine
Pure-Python, zero external dependencies (no scipy, no network).
Implements Kuhn-Munkres (Hungarian algorithm) for optimal bipartite matching.
"""

from typing import List, Dict, Any, Tuple, Optional
import math


def calculate_1d_iou(start1: int, end1: int, start2: int, end2: int) -> float:
    """Computes 1D intersection over union between two character spans."""
    intersection = max(0, min(end1, end2) - max(start1, start2))
    union = max(end1, end2) - min(start1, start2)
    return float(intersection) / float(union) if union > 0 else 0.0


def calculate_span_intersection_length(start1: int, end1: int, start2: int, end2: int) -> int:
    """Computes the length of the overlapping character span between two ranges."""
    return max(0, min(end1, end2) - max(start1, start2))


def calculate_2d_iou(box1: List[float], box2: List[float]) -> float:
    """
    Computes 2D IoU between two bounding boxes [x0, y0, x1, y1].
    """
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


def solve_max_weight_bipartite(weight_matrix: List[List[float]]) -> List[Tuple[int, int]]:
    """
    Pure Python Kuhn-Munkres (Hungarian) algorithm to find maximum-weight matching
    in an N x M bipartite graph.
    
    weight_matrix: N rows (expected entities), M cols (detected entities).
    Returns list of matched (row_idx, col_idx) pairs that maximize total weight.
    Only pairs with weight > 0 are returned.
    """
    n_rows = len(weight_matrix)
    if n_rows == 0:
        return []
    n_cols = len(weight_matrix[0])
    if n_cols == 0:
        return []

    # Make square matrix by padding with zeros
    dim = max(n_rows, n_cols)
    # Find max weight to convert max-weight problem to min-cost
    max_val = 0.0
    for r in range(n_rows):
        for c in range(n_cols):
            if weight_matrix[r][c] > max_val:
                max_val = weight_matrix[r][c]

    cost = [[0.0] * dim for _ in range(dim)]
    for r in range(dim):
        for c in range(dim):
            if r < n_rows and c < n_cols:
                cost[r][c] = max_val - weight_matrix[r][c]
            else:
                cost[r][c] = max_val

    # Standard Kuhn-Munkres algorithm for min-cost bipartite matching (O(V^3))
    u = [0.0] * (dim + 1)
    v = [0.0] * (dim + 1)
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

    # Extract matching pairs
    matched_pairs = []
    for j in range(1, dim + 1):
        i = p[j]
        if i > 0:
            row = i - 1
            col = j - 1
            if row < n_rows and col < n_cols:
                if weight_matrix[row][col] > 0.0:
                    matched_pairs.append((row, col))

    # Deterministic sorting of matched pairs
    matched_pairs.sort(key=lambda x: (x[0], x[1]))
    return matched_pairs


def match_entities_bipartite(
    expected_list: List[Dict[str, Any]],
    detected_list: List[Dict[str, Any]],
    iou_threshold: float = 0.50
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Performs deterministic maximum-weight bipartite matching between expected and detected entities.
    
    1. Filters on entity-type compatibility (different types have weight 0).
    2. Overlap weight = 1.0 + IoU (if IoU >= iou_threshold, else 0).
    3. Breaks ties deterministically via start offset and IDs.
    4. Tracks exact span matches (e.start == d.start and e.end == d.end).
    5. Calculates residual characters via actual span intersection.
    6. Identifies duplicate/unassigned predictions.
    """
    # Initialize states
    for idx, e in enumerate(expected_list):
        e["matched_by"] = None
        e["is_exact_match"] = False
        e["match_iou"] = 0.0
        e["residual_characters"] = len(e.get("value", ""))
        e["incomplete_span"] = False
        if "id" not in e:
            e["id"] = f"exp_{idx}"

    for idx, d in enumerate(detected_list):
        d["matched_to"] = None
        d["is_exact_match"] = False
        d["match_iou"] = 0.0
        d["duplicate_of"] = None
        if "id" not in d:
            d["id"] = f"det_{idx}"

    n_exp = len(expected_list)
    n_det = len(detected_list)

    if n_exp == 0 or n_det == 0:
        return expected_list, detected_list

    # Construct weight matrix
    weight_matrix = [[0.0] * n_det for _ in range(n_exp)]
    for i, e in enumerate(expected_list):
        for j, d in enumerate(detected_list):
            if e["type"] == d["type"]:
                iou = calculate_1d_iou(e["start"], e["end"], d["start"], d["end"])
                if iou >= iou_threshold:
                    # Base weight 1.0 ensures any valid IoU beats no match; add IoU for tie-breaking
                    weight_matrix[i][j] = 1.0 + iou

    # Solve optimal assignment
    pairs = solve_max_weight_bipartite(weight_matrix)

    for i, j in pairs:
        e = expected_list[i]
        d = detected_list[j]
        iou = calculate_1d_iou(e["start"], e["end"], d["start"], d["end"])
        
        e["matched_by"] = j
        e["match_iou"] = iou
        d["matched_to"] = i
        d["match_iou"] = iou

        # Check exact span
        is_exact = (e["start"] == d["start"]) and (e["end"] == d["end"])
        e["is_exact_match"] = is_exact
        d["is_exact_match"] = is_exact

        # Compute residual characters via actual character-span intersection
        # Residual characters = len(e.value) - length_of_intersection(e, d)
        inter_len = calculate_span_intersection_length(e["start"], e["end"], d["start"], d["end"])
        val_len = len(e.get("value", ""))
        residual = max(0, val_len - inter_len)
        e["residual_characters"] = residual
        e["incomplete_span"] = (residual > 0)

    # Identify duplicate detections (unmatched detections that overlap an already matched detection)
    for j1, d1 in enumerate(detected_list):
        if d1["matched_to"] is None:
            best_dup_iou = 0.0
            best_dup_target = None
            for j2, d2 in enumerate(detected_list):
                if j1 != j2 and d2["matched_to"] is not None and d1["type"] == d2["type"]:
                    dup_iou = calculate_1d_iou(d1["start"], d1["end"], d2["start"], d2["end"])
                    if dup_iou > best_dup_iou:
                        best_dup_iou = dup_iou
                        best_dup_target = j2
            if best_dup_iou >= iou_threshold:
                d1["duplicate_of"] = best_dup_target

    return expected_list, detected_list


def evaluate_residual_ocr_leak(
    ground_truth_value: str,
    extracted_ocr_text: str
) -> Dict[str, Any]:
    """
    Dual-channel residual PII evaluation on scanned artifacts:
    Channel 1: Exact matching for confirmed residual string leaks.
    Channel 2: Fuzzy matching (Levenshtein distance <= 1) as a candidate detection channel.
    
    Returns structured status distinguishing confirmed leak from fuzzy candidate.
    """
    clean_gt = ground_truth_value.strip().replace(" ", "")
    clean_ocr = extracted_ocr_text.strip().replace(" ", "")

    # Channel 1: Exact substring match
    if clean_gt in clean_ocr:
        return {
            "status": "CONFIRMED_LEAK",
            "is_confirmed_leak": True,
            "is_fuzzy_candidate": False,
            "edit_distance": 0,
            "matched_string": clean_gt
        }

    # Channel 2: Sliding window Levenshtein distance <= 1
    k = len(clean_gt)
    best_dist = 999
    best_candidate = ""
    
    if len(clean_ocr) >= k:
        for start_idx in range(len(clean_ocr) - k + 1):
            window = clean_ocr[start_idx:start_idx + k]
            dist = levenshtein_distance(clean_gt, window)
            if dist < best_dist:
                best_dist = dist
                best_candidate = window
                if dist <= 1:
                    break

    if best_dist <= 1 and len(best_candidate) > 0:
        return {
            "status": "FUZZY_CANDIDATE",
            "is_confirmed_leak": False,
            "is_fuzzy_candidate": True,
            "edit_distance": best_dist,
            "matched_string": best_candidate
        }

    return {
        "status": "CLEAN",
        "is_confirmed_leak": False,
        "is_fuzzy_candidate": False,
        "edit_distance": best_dist,
        "matched_string": None
    }
