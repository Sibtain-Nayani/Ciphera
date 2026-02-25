from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine
from typing import List, Dict
import uuid

app = FastAPI(title="Ciphera Presidio Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Presidio Analyzer Engine
# This will automatically pick up the Spacy language model installed
analyzer = AnalyzerEngine()

class RedactRequest(BaseModel):
    raw_text: str
    active_rules: Dict[str, bool]

@app.post("/analyze")
async def analyze(request: RedactRequest):
    # 1. Map frontend UI rules to Presidio's built-in Entity Types
    rule_map = {
        "email": "EMAIL_ADDRESS",
        "phone": "PHONE_NUMBER",
        "creditCard": "CREDIT_CARD",
        "ssn": "US_SSN",
        "names": "PERSON",
    }
    
    # Generate the list of entities the user currently has toggled ON
    entities = [rule_map[rule] for rule, active in request.active_rules.items() if active and rule in rule_map]
    
    # Short-circuit if no rules are active or text is empty
    if not entities or not request.raw_text:
        return {"tokens": [{"id": str(uuid.uuid4()), "type": "text", "value": request.raw_text}]}

    # 2. Run Presidio Analyzer
    # This runs the Spacy NLP models and Regex checks
    results = analyzer.analyze(text=request.raw_text, entities=entities, language='en')
    
    # Default behavior of analyze() handles overlaps, but we sort by start pos just to be safe for our loop
    results = sorted(results, key=lambda x: x.start)
    
    # 3. Construct the AST (Tokens) for React
    tokens = []
    current_index = 0
    reverse_map = {v: k for k, v in rule_map.items()}
    
    for res in results:
        # Add the non-sensitive text before this entity
        if res.start > current_index:
            tokens.append({
                "id": str(uuid.uuid4()),
                "type": "text",
                "value": request.raw_text[current_index:res.start]
            })
            
        # Add the sensitive entity token
        frontend_rule_type = reverse_map.get(res.entity_type, "text")
        tokens.append({
            "id": str(uuid.uuid4()),
            "type": frontend_rule_type,
            "value": request.raw_text[res.start:res.end]
        })
        
        current_index = res.end
        
    # Catch any remaining text after the last entity
    if current_index < len(request.raw_text):
        tokens.append({
            "id": str(uuid.uuid4()),
            "type": "text",
            "value": request.raw_text[current_index:]
        })
        
    return {"tokens": tokens}
