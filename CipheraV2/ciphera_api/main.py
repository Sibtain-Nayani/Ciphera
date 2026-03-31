from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
from typing import List, Dict
import uuid
import re
import logging
import json
from pdf_redaction import router as pdf_router

# ── Audit Logging Configuration ──
logging.basicConfig(level=logging.INFO)
audit_logger = logging.getLogger("ciphera.audit")

app = FastAPI(title="Ciphera Presidio Backend")
app.include_router(pdf_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Presidio Analyzer Engine
analyzer = AnalyzerEngine()


class CustomRulePayload(BaseModel):
    """A user-defined regex rule sent from the frontend."""
    id: str
    label: str
    pattern: str


class RedactRequest(BaseModel):
    raw_text: str
    active_rules: Dict[str, bool]
    custom_rules: List[CustomRulePayload] = []


# ── Mapping from frontend rule keys to Presidio entity types ──
RULE_MAP = {
    "email": "EMAIL_ADDRESS",
    "phone": "PHONE_NUMBER",
    "creditCard": "CREDIT_CARD",
    "ssn": "US_SSN",
    "names": "PERSON",
}

REVERSE_RULE_MAP = {v: k for k, v in RULE_MAP.items()}


# ── ReDoS Protection ──
MAX_REGEX_LEN = 500
# Detects nested quantifiers (e.g. (a+)+, (a*)+, (a{2,})*) that cause catastrophic backtracking
DANGEROUS_PATTERN = re.compile(r"\([^)]*[*+}][^)]*\)[*+{]")


def _validate_regex_safe(pattern: str) -> bool:
    """
    Validates a regex pattern for BOTH correctness AND ReDoS safety.

    1. Rejects patterns longer than MAX_REGEX_LEN characters.
    2. Rejects patterns containing nested quantifiers (catastrophic backtracking).
    3. Compiles and test-runs the pattern to verify it terminates.
    """
    if not pattern or len(pattern) > MAX_REGEX_LEN:
        return False

    # Static check for dangerous nested quantifiers
    if DANGEROUS_PATTERN.search(pattern):
        return False

    try:
        compiled = re.compile(pattern)
        # Test-run against a short string to verify it terminates quickly
        compiled.search("a" * 100)
        return True
    except re.error:
        return False


@app.post("/analyze")
async def analyze(request: RedactRequest):
    # 1. Build the entities list for built-in rules
    entities = [
        RULE_MAP[rule]
        for rule, active in request.active_rules.items()
        if active and rule in RULE_MAP
    ]

    # 2. Register dynamic recognizers for custom rules (with ReDoS protection)
    custom_entity_map: Dict[str, str] = {}   # presidio_entity -> custom rule id
    dynamic_recognizers: List[PatternRecognizer] = []

    for cr in request.custom_rules:
        if not _validate_regex_safe(cr.pattern):
            continue   # skip invalid or dangerous regex silently

        entity_type = f"CUSTOM_{cr.id}".upper().replace("-", "_")
        custom_entity_map[entity_type] = cr.id
        entities.append(entity_type)

        presidio_pattern = Pattern(
            name=cr.label,
            regex=cr.pattern,
            score=0.85,
        )
        recognizer = PatternRecognizer(
            supported_entity=entity_type,
            patterns=[presidio_pattern],
            name=f"custom_{cr.id}_recognizer",
        )
        analyzer.registry.add_recognizer(recognizer)
        dynamic_recognizers.append(recognizer)

    # Short-circuit if no rules are active or text is empty
    if not entities or not request.raw_text:
        _cleanup_recognizers(dynamic_recognizers)
        return {
            "tokens": [
                {"id": str(uuid.uuid4()), "type": "text", "value": request.raw_text}
            ]
        }

    # 3. Run Presidio Analyzer
    try:
        results = analyzer.analyze(
            text=request.raw_text, entities=entities, language="en"
        )
    except Exception as e:
        _cleanup_recognizers(dynamic_recognizers)
        # ── FAIL-SECURE & Audit Log ──
        audit_logger.error(json.dumps({
            "event": "ANONYMIZATION_RUN",
            "policy_version": "v2.0",
            "status": "FAIL",
            "error_detail": str(e)
        }))
        return JSONResponse(
            status_code=500,
            content={
                "error": "Redaction engine failure. Analysis could not be completed.",
                "tokens": [],
            },
        )

    results = sorted(results, key=lambda x: x.start)
    
    # ── Audit Log Success ──
    audit_logger.info(json.dumps({
        "event": "ANONYMIZATION_RUN",
        "policy_version": "v2.0",
        "rules_applied": list(request.active_rules.keys()) + [cr.label for cr in request.custom_rules],
        "entities_detected": len(results),
        "status": "SUCCESS"
    }))

    # 4. Construct the AST (Tokens) for React
    tokens = []
    current_index = 0

    for res in results:
        # Non-sensitive text before this entity
        if res.start > current_index:
            tokens.append(
                {
                    "id": str(uuid.uuid4()),
                    "type": "text",
                    "value": request.raw_text[current_index : res.start],
                }
            )

        # Determine the frontend rule type
        if res.entity_type in REVERSE_RULE_MAP:
            frontend_type = REVERSE_RULE_MAP[res.entity_type]
        elif res.entity_type in custom_entity_map:
            frontend_type = f"custom_{custom_entity_map[res.entity_type]}"
        else:
            frontend_type = "text"

        tokens.append(
            {
                "id": str(uuid.uuid4()),
                "type": frontend_type,
                "value": request.raw_text[res.start : res.end],
            }
        )
        current_index = res.end

    # Catch remaining text
    if current_index < len(request.raw_text):
        tokens.append(
            {
                "id": str(uuid.uuid4()),
                "type": "text",
                "value": request.raw_text[current_index:],
            }
        )

    # 5. Clean up dynamically registered recognizers
    _cleanup_recognizers(dynamic_recognizers)

    return {"tokens": tokens}


def _cleanup_recognizers(recognizers: List[PatternRecognizer]):
    """Remove dynamic recognizers from the registry to prevent accumulation."""
    for rec in recognizers:
        try:
            analyzer.registry.remove_recognizer(rec.name)
        except Exception:
            pass
