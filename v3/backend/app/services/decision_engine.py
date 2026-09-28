from typing import List, Dict, Any

from app.schemas.document import RedactionEntity

class DecisionEngine:
    """
    Phase 5: Decision Engine (Updated for Phase 8 Human-in-the-Loop)
    Applies contextual guardrails and organization policies to raw detections.
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
        elif mode == "high_precision":
            # Avoid unnecessary redaction
            auto_threshold = 0.95
            review_threshold = 0.75
        else: # balanced
            auto_threshold = 0.85
            review_threshold = 0.50
            
        for ent in entities:
            # Enforce Indian PII specific rules
            # Aadhaar requires higher confidence to auto-redact if not clearly matched
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
