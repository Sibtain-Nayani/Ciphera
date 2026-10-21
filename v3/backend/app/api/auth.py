import bcrypt
import jwt
import hashlib
import secrets
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.models.identity import User, Session, Organization, OrganizationMember, OrgRole
from app.schemas.auth import UserCreate, LoginRequest, TokenResponse, RefreshRequest, UserResponse

router = APIRouter(prefix="/api/v3/auth", tags=["Authentication (SQLAlchemy)"])

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(
    user_id: str,
    email: str,
    org_id_or_role: Optional[str] = None,
    role: Optional[str] = None
) -> str:
    """Supports both 3-arg (user_id, email, role) and 4-arg (user_id, email, org_id, role) calls."""
    now = datetime.now(timezone.utc)
    if role is None:
        actual_role = org_id_or_role or "user"
        actual_org_id = None
    else:
        actual_org_id = org_id_or_role
        actual_role = role or "user"

    payload = {
        "sub": user_id,
        "email": email,
        "org_id": actual_org_id,
        "role": actual_role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def _ensure_user_default_org(user: User, db: DBSession) -> str:
    """Ensures user belongs to at least one organization so uploads succeed."""
    if user.org_memberships:
        return user.org_memberships[0].org_id

    default_org = db.query(Organization).filter(Organization.id == "default-org").first()
    if not default_org:
        default_org = Organization(id="default-org", name="Default Organization", created_by=user.id)
        db.add(default_org)
        db.flush()

    membership = db.query(OrganizationMember).filter(
        OrganizationMember.org_id == default_org.id,
        OrganizationMember.user_id == user.id
    ).first()
    if not membership:
        membership = OrganizationMember(
            org_id=default_org.id,
            user_id=user.id,
            role=OrgRole.ADMIN if user.global_role.value == "super_admin" else OrgRole.MEMBER
        )
        db.add(membership)
        db.commit()
    return default_org.id

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

    org_id = _ensure_user_default_org(user, db)
    
    # Generate tokens
    access_token = create_access_token(user.id, user.email, org_id, user.global_role.value)
    
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
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        user=UserResponse.model_validate(user, from_attributes=True)
    )

@router.post("/login", response_model=TokenResponse)
def login(login_req: LoginRequest, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.email == login_req.email).first()
    if not user or not verify_password(login_req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    org_id = _ensure_user_default_org(user, db)
    access_token = create_access_token(user.id, user.email, org_id, user.global_role.value)
    
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
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        user=UserResponse.model_validate(user, from_attributes=True)
    )

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security), db: DBSession = Depends(get_db)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
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
    return UserResponse.model_validate(current_user, from_attributes=True)

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
    org_id = _ensure_user_default_org(user, db)
    
    # Rotate tokens
    access_token = create_access_token(user.id, user.email, org_id, user.global_role.value)
    
    new_refresh_plain = secrets.token_hex(32)
    new_refresh_hash = hashlib.sha256(new_refresh_plain.encode()).hexdigest()
    
    session_obj.refresh_token_hash = new_refresh_hash
    session_obj.expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_plain,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        user=UserResponse.model_validate(user, from_attributes=True)
    )

@router.post("/logout")
def logout(req: RefreshRequest, db: DBSession = Depends(get_db)):
    req_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()
    session_obj = db.query(Session).filter(Session.refresh_token_hash == req_hash).first()
    if session_obj:
        db.delete(session_obj)
        db.commit()
    return {"ok": True, "message": "Logged out successfully"}
