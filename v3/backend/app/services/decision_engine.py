from typing import List, Dict, Any

from app.schemas.document import RedactionEntity

class DecisionEngine:
    """
    Phase 5: Decision Engine
    Applies contextual guardrails and organization policies to raw detections.
    """
    
    @staticmethod
    def apply_policies(entities: List[RedactionEntity], policy_config: Dict[str, Any] = None) -> List[RedactionEntity]:
        if policy_config is None:
            policy_config = {"mode": "standard"}
            
        mode = policy_config.get("mode", "standard")
        
        # Base thresholds
        if mode == "strict":
            threshold = 0.45
        elif mode == "relaxed":
            threshold = 0.85
        else:
            threshold = 0.60
            
        filtered = []
        for ent in entities:
            # Drop entities below policy threshold
            if ent.score < threshold:
                ent.status = "rejected"
                # We can still keep them in the DB as rejected for audit purposes
            
            # Example Guardrail: 12 digit number must have high confidence or Aadhaar context
            if ent.entity_type == "IN_AADHAAR" and ent.score < 0.75:
                # If we had a context keyword flag, we would check it here.
                # For now, we enforce stricter bounds on specific high-risk entities
                if mode != "strict":
                    ent.status = "rejected"
                    
            filtered.append(ent)
            
        return filtered
