def calculate_1d_iou(start1, end1, start2, end2):
    intersection = max(0, min(end1, end2) - max(start1, start2))
    union = max(end1, end2) - min(start1, start2)
    return intersection / union if union > 0 else 0.0

def match_entities(expected_list, detected_list, iou_threshold=0.5):
    # Initialize state
    for e in expected_list:
        e["matched_by"] = None
    for d in detected_list:
        d["matched_to"] = None
        d["duplicate_of"] = None

    # Calculate all valid pairs
    pairs = []
    for i, e in enumerate(expected_list):
        for j, d in enumerate(detected_list):
            if e["type"] == d["type"]:
                iou = calculate_1d_iou(e["start"], e["end"], d["start"], d["end"])
                if iou >= iou_threshold:
                    pairs.append((iou, i, j))

    # Sort pairs by IoU descending for greedy matching
    pairs.sort(key=lambda x: x[0], reverse=True)

    # Greedy match
    for iou, i, j in pairs:
        if expected_list[i]["matched_by"] is None and detected_list[j]["matched_to"] is None:
            expected_list[i]["matched_by"] = j
            detected_list[j]["matched_to"] = i

    # Identify duplicates (detected entities that overlap heavily with a matched detected entity)
    # This prevents the metric from blindly treating overlaps as completely independent FPs without context
    for j1, d1 in enumerate(detected_list):
        if d1["matched_to"] is None:
            best_dup_iou = 0.0
            best_dup_idx = None
            for j2, d2 in enumerate(detected_list):
                if j1 != j2 and d2["matched_to"] is not None and d1["type"] == d2["type"]:
                    iou = calculate_1d_iou(d1["start"], d1["end"], d2["start"], d2["end"])
                    if iou > best_dup_iou:
                        best_dup_iou = iou
                        best_dup_idx = j2
            if best_dup_iou >= iou_threshold:
                d1["duplicate_of"] = best_dup_idx

    return expected_list, detected_list
