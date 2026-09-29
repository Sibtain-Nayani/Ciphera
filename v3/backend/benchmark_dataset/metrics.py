def calculate_metrics(expected_list, detected_list):
    tp = sum(1 for e in expected_list if e["matched_by"] is not None)
    fn = sum(1 for e in expected_list if e["matched_by"] is None)
    
    # False positives are detections that matched NO expected entity
    fp = sum(1 for d in detected_list if d["matched_to"] is None)
    
    # We could subtract duplicates from FP if we don't want to double-punish,
    # but currently a duplicate output is a pipeline failure (lack of merge).
    # We will track duplicates separately for reporting but keep them in FP.
    dups = sum(1 for d in detected_list if d["duplicate_of"] is not None)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "dups": dups,
        "precision": precision,
        "recall": recall,
        "f1": f1
    }

def calculate_class_metrics(expected_list, detected_list):
    classes = set([e["type"] for e in expected_list] + [d["type"] for d in detected_list])
    results = {}
    
    for cls in classes:
        cls_expected = [e for e in expected_list if e["type"] == cls]
        cls_detected = [d for d in detected_list if d["type"] == cls]
        results[cls] = calculate_metrics(cls_expected, cls_detected)
        
    return results
