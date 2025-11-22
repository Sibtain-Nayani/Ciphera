from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
from typing import Optional, List, Dict, Any

# Initialize Presidio engines
analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

def anonymize_text(
    text: str,
    entities: Optional[List[str]] = None,
    technique: str = "mask",
) -> Dict[str, Any]:
    """
    Anonymize text using Presidio.
    
    Args:
        text: The text to anonymize
        entities: List of entity types to detect (e.g., ["PERSON", "EMAIL_ADDRESS"])
                 If None, detects all supported types
        technique: Anonymization technique ("mask", "replace", "hash", "encrypt")
    
    Returns:
        Dict with anonymized text, detected entities, and metadata
    """
    try:
        # Analyze text for PII
        results = analyzer.analyze(text=text, language="en", entities=entities)
        
        # Build operator config based on technique
        operators = build_operators(technique)
        
        # Anonymize based on detected entities
        if results:
            anonymized_text = anonymizer.anonymize(
                text=text,
                analyzer_results=results,
                operators=operators
            )
            
            # Collect detected entities for audit log
            detected = [
                {
                    "type": r.entity_type,
                    "start": r.start,
                    "end": r.end,
                    "text": text[r.start:r.end],
                    "score": r.score
                }
                for r in results
            ]
        else:
            anonymized_text = text
            detected = []
        
        return {
            "original": text,
            "anonymized": anonymized_text.text if hasattr(anonymized_text, 'text') else anonymized_text,
            "detected_entities": detected,
            "entity_count": len(detected),
            "technique": technique,
            "status": "success"
        }
    
    except Exception as e:
        return {
            "original": text,
            "anonymized": text,
            "error": str(e),
            "status": "error"
        }

def build_operators(technique: str) -> Dict[str, OperatorConfig]:
    """
    Build Presidio operator config based on anonymization technique.
    Return explicit operator mapping for common entity types to ensure masking is applied.
    """
    common_entities = [
        "PERSON",
        "EMAIL_ADDRESS",
        "PHONE_NUMBER",
        "CREDIT_CARD",
        "US_SSN",
        "URL",
        "IP_ADDRESS",
        "ORGANIZATION",
        "LOCATION",
        "DATE_TIME",
    ]

    if technique == "mask":
        # create a separate OperatorConfig per entity
        operators = {ent: OperatorConfig("mask", {"masking_char": "*", "chars_to_mask": 1000, "from_end": False}) for ent in common_entities}
        operators["DEFAULT"] = OperatorConfig("mask", {"masking_char": "*", "chars_to_mask": 1000, "from_end": False})
        return operators

    if technique == "replace":
        return {
            "PERSON": OperatorConfig("replace", {"new_value": "[PERSON]"}),
            "EMAIL_ADDRESS": OperatorConfig("replace", {"new_value": "[EMAIL]"}),
            "PHONE_NUMBER": OperatorConfig("replace", {"new_value": "[PHONE]"}),
            "CREDIT_CARD": OperatorConfig("replace", {"new_value": "[CREDIT_CARD]"}),
            "US_SSN": OperatorConfig("replace", {"new_value": "[SSN]"}),
            "URL": OperatorConfig("replace", {"new_value": "[URL]"}),
            "DEFAULT": OperatorConfig("replace", {"new_value": "[REDACTED]"}),
        }

    if technique == "hash":
        return {ent: OperatorConfig("hash") for ent in common_entities}

    # fallback => mask
    return {ent: OperatorConfig("mask", {"masking_char": "*", "chars_to_mask": 1000, "from_end": False}) for ent in common_entities}

def get_supported_entities() -> List[str]:
    """Return list of supported entity types Presidio can detect."""
    return analyzer.get_supported_entities()