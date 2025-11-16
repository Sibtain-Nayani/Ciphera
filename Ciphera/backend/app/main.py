from fastapi import FastAPI, Form, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
import PyPDF2
from app.services import anonymize_text, get_supported_entities

app = FastAPI(title="Ciphera (Presidio)")

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def read_text_from_file(upload: UploadFile) -> str:
    """Extract text from uploaded .txt or .pdf file."""
    try:
        if upload.filename.endswith('.pdf'):
            reader = PyPDF2.PdfReader(upload.file)
            pages = [p.extract_text() or "" for p in reader.pages]
            return "\n".join(pages)
        else:
            data = upload.file.read()
            return data.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}

@app.get("/api/entities")
async def get_entities():
    """Return supported entity types."""
    return {"entities": get_supported_entities()}

@app.post("/api/anonymize")
async def anonymize(
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    entities: Optional[str] = Form(None),  # JSON list of entity types
    technique: str = Form("mask")  # mask, replace, hash
):
    """
    Anonymize text or uploaded file.
    
    Args:
        text: Plain text to anonymize
        file: Uploaded .txt or .pdf file
        entities: JSON list of entity types to detect (e.g., '["PERSON", "EMAIL_ADDRESS"]')
        technique: Anonymization method (mask, replace, hash)
    
    Returns:
        JSON with original, anonymized text, detected entities, and metadata
    """
    # Extract content
    content = ""
    if file is not None:
        content = read_text_from_file(file)
    elif text:
        content = text
    else:
        raise HTTPException(status_code=400, detail="Either text or file required")
    
    # Parse entities filter
    entity_list = None
    if entities:
        try:
            import json
            entity_list = json.loads(entities)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON in 'entities' parameter")
    
    # Anonymize using Presidio
    result = anonymize_text(content, entities=entity_list, technique=technique)
    return result

@app.post("/api/batch-anonymize")
async def batch_anonymize(
    files: List[UploadFile] = File(...),
    technique: str = Form("mask")
):
    """
    Batch anonymize multiple files.
    
    Returns:
        List of anonymization results for each file
    """
    results = []
    for file in files:
        try:
            content = read_text_from_file(file)
            result = anonymize_text(content, technique=technique)
            result["filename"] = file.filename
            results.append(result)
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "error",
                "error": str(e)
            })
    return {"results": results}