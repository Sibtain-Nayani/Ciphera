from fastapi import FastAPI, Form, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from typing import Optional, List
from datetime import timedelta
import PyPDF2
import docx
from sqlalchemy.orm import Session

from app.services import anonymize_text, get_supported_entities
from app.database import get_db, engine, Base
from app.models import User, Job
from app.schemas import UserCreate, UserResponse, Token, JobCreate, JobResponse
from app.auth import (
    hash_password,
    authenticate_user,
    create_access_token,
    get_current_active_user,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

app = FastAPI(title="Ciphera (Presidio)")

# Create database tables on startup
@app.on_event("startup")
def startup():
    """
    Startup event handler.
    
    This runs when the FastAPI server starts.
    It creates all database tables defined in models.py.
    
    If tables already exist, this does nothing (safe to run multiple times).
    """
    Base.metadata.create_all(bind=engine)

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
        elif upload.filename.endswith('.docx'):
            doc = docx.Document(upload.file)
            return "\n".join([paragraph.text for paragraph in doc.paragraphs])
        else:
            data = upload.file.read()
            return data.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.post("/api/register", response_model=UserResponse)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user.
    
    This endpoint:
    1. Checks if email already exists
    2. Hashes the password
    3. Creates user in database
    4. Returns user data (without password)
    
    Request body:
        {
            "email": "user@example.com",
            "password": "securepassword123",
            "full_name": "John Doe"  // optional
        }
    
    Response:
        {
            "id": 1,
            "email": "user@example.com",
            "full_name": "John Doe",
            "is_active": true,
            "created_at": "2024-01-15T10:30:00"
        }
    """
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    # Create new user
    db_user = User(
        email=user.email,
        hashed_password=hash_password(user.password),
        full_name=user.full_name
    )
    
    # Save to database
    db.add(db_user)
    db.commit()
    db.refresh(db_user)  # Refresh to get the auto-generated ID
    
    return db_user


@app.post("/api/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Login endpoint - returns JWT token.
    
    This follows the OAuth2 password flow standard.
    
    How it works:
    1. User sends email (as 'username') and password
    2. We verify credentials
    3. If valid, create JWT token
    4. Return token to user
    5. User stores token and sends it with future requests
    
    Request (form data, not JSON):
        username: user@example.com  // OAuth2 calls it 'username' but we use email
        password: securepassword123
    
    Response:
        {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "bearer"
        }
    
    Frontend usage:
        1. Store access_token in localStorage
        2. Send with requests: Authorization: Bearer <token>
    """
    # Authenticate user
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/users/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """
    Get current user information.
    
    This is a protected route - requires valid JWT token.
    
    How it works:
    1. Extract token from Authorization header
    2. Verify token signature
    3. Get user email from token
    4. Look up user in database
    5. Return user data
    
    Request headers:
        Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    
    Response:
        {
            "id": 1,
            "email": "user@example.com",
            "full_name": "John Doe",
            "is_active": true,
            "created_at": "2024-01-15T10:30:00"
        }
    
    This endpoint is useful for:
    - Getting user profile data
    - Verifying token is still valid
    - Checking if user is still active
    """
    return current_user


# ============================================================================
# PRESIDIO ANONYMIZATION ENDPOINTS
# ============================================================================

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
    
    # Save job to database
    try:
        # Create a new database session
        db = next(get_db())
        job = Job(
            source=file.filename if file else "Free text",
            technique=result["technique"],
            entity_count=result["entity_count"],
            status=result["status"]
        )
        db.add(job)
        db.commit()
    except Exception as e:
        print(f"Failed to save job: {e}")
        
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


@app.post("/api/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """
    Extract text from an uploaded file without anonymizing it.
    
    Args:
        file: Uploaded .txt or .pdf file
        
    Returns:
        JSON with the extracted text and filename
    """
    try:
        content = read_text_from_file(file)
        return {
            "filename": file.filename,
            "text": content,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not extract text: {str(e)}")


@app.get("/api/jobs", response_model=List[JobResponse])
async def get_jobs(db: Session = Depends(get_db)):
    """
    Get recent anonymization jobs.
    """
    jobs = db.query(Job).order_by(Job.created_at.desc()).limit(50).all()
    return jobs