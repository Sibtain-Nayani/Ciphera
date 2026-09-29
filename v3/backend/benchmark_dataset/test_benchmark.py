import json
import os
import pytest

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASELINE_PATH = os.path.join(BASE_DIR, "baseline.json")
DATASET_PATH = os.path.join(BASE_DIR, "dataset.json")

def load_baseline():
    if not os.path.exists(BASELINE_PATH):
        pytest.skip("Baseline file not found. Run runner.py first.")
    with open(BASELINE_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_dataset():
    with open(DATASET_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def test_benchmark_runs_successfully():
    """Ensure the baseline file was successfully generated and contains global metrics."""
    baseline = load_baseline()
    assert "global" in baseline
    assert "classes" in baseline

def test_every_ground_truth_case_evaluated():
    """Ensure every document in dataset.json was actually evaluated (proxy via expected entity count)."""
    dataset = load_dataset()
    baseline = load_baseline()
    
    total_expected_dataset = sum(len(doc["expected_entities"]) for doc in dataset)
    total_evaluated = baseline["global"]["tp"] + baseline["global"]["fn"]
    
    assert total_expected_dataset == total_evaluated, "Not all ground-truth entities were evaluated!"

def test_overall_recall_does_not_regress():
    """Overall recall must not fall below the v1 baseline of 0.5484"""
    baseline = load_baseline()
    assert baseline["global"]["recall"] >= 0.54, f"Overall recall dropped to {baseline['global']['recall']}!"

def test_critical_pii_classes_do_not_regress():
    """PAN and Aadhaar recall must not fall below the baseline"""
    baseline = load_baseline()
    classes = baseline["classes"]
    
    if "PAN_NUMBER" in classes:
        assert classes["PAN_NUMBER"]["recall"] >= 0.40, "PAN recall dropped!"
    if "AADHAAR_NUMBER" in classes:
        assert classes["AADHAAR_NUMBER"]["recall"] >= 0.60, "Aadhaar recall dropped!"

def test_false_positive_rate_bounded():
    """Ensure false positives don't skyrocket to cheat recall."""
    baseline = load_baseline()
    assert baseline["global"]["precision"] >= 0.50, f"Precision dropped to {baseline['global']['precision']}, too many FPs!"
