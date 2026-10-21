from typing import List, Dict, Any

from app.schemas.document import RedactionEntity
from app.services.ml_context_classifier import ContextualMLClassifier

ml_classifier = ContextualMLClassifier()

class DecisionEngine:
    """
    Phase 5: Decision Engine (Integrated with Contextual ML Tree Ensemble & Human Review)
    Applies contextual ML classification and organization policies to raw detections.
    Prevents false positives on benign document structure (totals, units, table headers).
    """
    
    @staticmethod
    def apply_policies(entities: List[RedactionEntity], policy_config: Dict[str, Any] = None) -> List[RedactionEntity]:
        if policy_config is None:
            policy_config = {"mode": "balanced"}
            
        mode = policy_config.get("mode", "balanced")
        
        # Policy Thresholds based on Redaction Modes
        if mode == "high_recall":
            # Miss as little as possible
            auto_threshold = 0.70
            review_threshold = 0.30
            ml_filter_threshold = 0.25
        elif mode == "high_precision":
            # Avoid unnecessary redaction
            auto_threshold = 0.95
            review_threshold = 0.75
            ml_filter_threshold = 0.55
        else: # balanced
            auto_threshold = 0.85
            review_threshold = 0.50
            ml_filter_threshold = 0.40
            
        for ent in entities:
            # 1. Run through Contextual ML Classifier (filters out benign headers, units, totals)
            bbox_dict = None
            if ent.bbox:
                if hasattr(ent.bbox, "model_dump"):
                    bbox_dict = ent.bbox.model_dump()
                elif isinstance(ent.bbox, dict):
                    bbox_dict = ent.bbox
                else:
                    bbox_dict = {"x0": ent.bbox.x0, "y0": ent.bbox.y0, "x1": ent.bbox.x1, "y1": ent.bbox.y1}

            should_redact, ml_prob, reason = ml_classifier.should_redact(
                text=ent.text,
                bbox=bbox_dict,
                presidio_score=ent.score,
                threshold=ml_filter_threshold
            )

            # If the ML model flags this as a benign false positive (e.g. "Total", "Amount", "$"):
            if not should_redact:
                ent.status = "rejected"
                continue

            # Update score with the contextual ML probability for generic entities
            if ent.entity_type not in ["AADHAAR_NUMBER", "PAN_NUMBER"]:
                ent.score = max(ent.score, ml_prob)

            # Enforce Indian PII specific rules
            # Aadhaar and PAN require higher confidence to auto-redact if not clearly matched
            if ent.entity_type in ["AADHAAR_NUMBER", "PAN_NUMBER"] and ent.score < 0.90:
                # Force to review unless it's extremely high confidence (like 0.95 from regex)
                if ent.score >= review_threshold:
                    ent.status = "pending"
                else:
                    ent.status = "rejected"
                continue

            # Standard Threshold Logic
            if ent.score >= auto_threshold:
                ent.status = "accepted"
            elif ent.score >= review_threshold:
                ent.status = "pending"
            else:
                ent.status = "rejected"
            
        return entities
