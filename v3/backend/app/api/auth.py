import bcrypt
import jwt
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.models.identity import User, Session
from app.schemas.auth import UserCreate, LoginRequest, TokenResponse, RefreshRequest, UserResponse

router = APIRouter(prefix="/api/v3/auth", tags=["Authentication (SQLAlchemy)"])

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

@router.post("/register", response_model=TokenResponse)
def register(user_in: UserCreate, db: DBSession = Depends(get_db)):
    # Check if user exists
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        password_hash=hash_password(user_in.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Generate tokens
    access_token = create_access_token(user.id, user.email, None, user.global_role.value)
    
    refresh_token_plain = secrets.token_hex(32)
    refresh_token_hash = hashlib.sha256(refresh_token_plain.encode()).hexdigest()
    
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    session_obj = Session(
        user_id=user.id,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at
    )
    db.add(session_obj)
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_plain,
        user_id=user.id,
        user=user
    )

@router.post("/login", response_model=TokenResponse)
def login(login_req: LoginRequest, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.email == login_req.email).first()
    if not user or not verify_password(login_req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    access_token = create_access_token(user.id, user.email, None, user.global_role.value)
    
    refresh_token_plain = secrets.token_hex(32)
    refresh_token_hash = hashlib.sha256(refresh_token_plain.encode()).hexdigest()
    
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    session_obj = Session(
        user_id=user.id,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at
    )
    db.add(session_obj)
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_plain,
        user_id=user.id,
        user=user
    )
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: DBSession = Depends(get_db)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/refresh", response_model=TokenResponse)
def refresh_token(req: RefreshRequest, db: DBSession = Depends(get_db)):
    req_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()
    session_obj = db.query(Session).filter(Session.refresh_token_hash == req_hash).first()
    
    if not session_obj or session_obj.expires_at < datetime.utcnow():
        if session_obj:
            db.delete(session_obj)
            db.commit()
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
        
    user = session_obj.user
    
    # Rotate tokens
    access_token = create_access_token(user.id, user.email, None, user.global_role.value)
    
    new_refresh_plain = secrets.token_hex(32)
    new_refresh_hash = hashlib.sha256(new_refresh_plain.encode()).hexdigest()
    
    session_obj.refresh_token_hash = new_refresh_hash
    session_obj.expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_plain,
        user_id=user.id,
        user=user
    )
