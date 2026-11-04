import bcrypt
import jwt
import hashlib
import secrets
from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.core.auth_rate_limit import AuthRateLimiter, get_auth_rate_limiter
from app.models.identity import User, Session, RefreshToken, Organization, OrganizationMember, OrgRole
from app.schemas.auth import UserCreate, LoginRequest, TokenResponse, RefreshRequest, UserResponse

router = APIRouter(prefix="/api/v3/auth", tags=["Authentication (SQLAlchemy)"])

def hash_password(plain: str) -> str:
    encoded = plain.encode("utf-8")
    if len(encoded) > 72:
        raise ValueError("Password must be at most 72 UTF-8 bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=12)).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        encoded = plain.encode("utf-8")
        return len(encoded) <= 72 and bcrypt.checkpw(encoded, hashed.encode())
    except Exception:
        return False

def create_access_token(
    user_id: str,
    email: str,
    org_id_or_role: Optional[str] = None,
    role: Optional[str] = None,
    *,
    session_id: str,
) -> str:
    """Create a short-lived access token bound to an active refresh session."""
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
        "sid": session_id,
        "key_version": settings.auth_key_version,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, settings.jwt_signing_secret, algorithm=settings.ALGORITHM)

def _ensure_user_default_org(user: User, db: DBSession, *, commit: bool = True) -> str:
    """
    Ensures the user has a private personal organization.

    A user's other memberships are intentionally left intact; callers that
    need the personal workspace must not select the first arbitrary membership.
    """
    user_personal_org_id = f"org_{user.id}"
    personal_org = db.query(Organization).filter(Organization.id == user_personal_org_id).first()
    created = False
    if not personal_org:
        personal_org = Organization(
            id=user_personal_org_id,
            name=f"{user.full_name or 'Personal'} Org",
            created_by=user.id
        )
        db.add(personal_org)
        db.flush()
        created = True

    membership = db.query(OrganizationMember).filter(
        OrganizationMember.org_id == personal_org.id,
        OrganizationMember.user_id == user.id
    ).first()
    if not membership:
        membership = OrganizationMember(
            org_id=personal_org.id,
            user_id=user.id,
            role=OrgRole.OWNER
        )
        db.add(membership)

        created = True

    if created:
        if commit:
            db.commit()
        else:
            db.flush()
    return personal_org.id

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
    refresh_token_plain = secrets.token_hex(32)
    refresh_token_hash = hashlib.sha256(refresh_token_plain.encode()).hexdigest()
    
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    session_obj = Session(
        user_id=user.id,
        refresh_token_hash=refresh_token_hash,
        signing_key_version=settings.auth_key_version,
        expires_at=expires_at
    )
    db.add(session_obj)
    db.flush()
    db.add(RefreshToken(session_id=session_obj.id, token_hash=refresh_token_hash, expires_at=expires_at))
    access_token = create_access_token(
        user.id, user.email, org_id, user.global_role.value, session_id=session_obj.id
    )
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
def login(
    login_req: LoginRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
):
    remote_ip = request.client.host if request.client else "unknown"
    limiter.enforce(
        "login-ip", remote_ip,
        limit=settings.AUTH_LOGIN_IP_LIMIT,
        window_seconds=settings.AUTH_LOGIN_WINDOW_SECONDS,
    )
    limiter.enforce(
        "login-account", login_req.email.casefold(),
        limit=settings.AUTH_LOGIN_ACCOUNT_LIMIT,
        window_seconds=settings.AUTH_LOGIN_WINDOW_SECONDS,
    )

    user = db.query(User).filter(User.email == login_req.email).first()
    if not user or not user.is_active or not verify_password(login_req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    org_id = _ensure_user_default_org(user, db)
    refresh_token_plain = secrets.token_hex(32)
    refresh_token_hash = hashlib.sha256(refresh_token_plain.encode()).hexdigest()
    
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    session_obj = Session(
        user_id=user.id,
        refresh_token_hash=refresh_token_hash,
        signing_key_version=settings.auth_key_version,
        expires_at=expires_at
    )
    db.add(session_obj)
    db.flush()
    db.add(RefreshToken(session_id=session_obj.id, token_hash=refresh_token_hash, expires_at=expires_at))
    access_token = create_access_token(
        user.id, user.email, org_id, user.global_role.value, session_id=session_obj.id
    )
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
        payload = jwt.decode(
            token,
            settings.jwt_signing_secret,
            algorithms=[settings.ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
            options={"require": ["sub", "sid", "exp", "iat", "iss", "aud", "type", "key_version"]},
        )
        user_id = payload.get("sub")
        if not user_id or payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid access token")
        if payload.get("key_version") != settings.auth_key_version:
            raise HTTPException(status_code=401, detail="Session invalidated by signing key rotation")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    active_session = db.query(Session).filter(
        Session.id == payload["sid"],
        Session.user_id == user_id,
        Session.signing_key_version == settings.auth_key_version,
        Session.expires_at > datetime.utcnow(),
    ).first()
    if not active_session:
        raise HTTPException(status_code=401, detail="Session is no longer active")
    return user

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user, from_attributes=True)

@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    req: RefreshRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
):
    remote_ip = request.client.host if request.client else "unknown"
    limiter.enforce(
        "refresh-ip", remote_ip,
        limit=settings.AUTH_REFRESH_IP_LIMIT,
        window_seconds=settings.AUTH_REFRESH_WINDOW_SECONDS,
    )

    req_hash = hashlib.sha256(req.refresh_token.encode()).hexdigest()
    token_obj = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == req_hash)
        .with_for_update()
        .first()
    )
    if token_obj is None:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    session_obj = (
        db.query(Session)
        .filter(Session.id == token_obj.session_id)
        .with_for_update()
        .first()
    )
    if session_obj is None:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    limiter.enforce(
        "refresh-account", session_obj.user_id,
        limit=settings.AUTH_REFRESH_ACCOUNT_LIMIT,
        window_seconds=settings.AUTH_REFRESH_WINDOW_SECONDS,
    )

    if token_obj.consumed_at is not None:
        # A previously rotated credential has been replayed. Revoke the whole
        # session so tokens issued from the same family stop authenticating.
        db.delete(session_obj)
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token reuse detected")

    if session_obj.signing_key_version != settings.auth_key_version:
        db.delete(session_obj)
        db.commit()
        raise HTTPException(status_code=401, detail="Session invalidated by signing key rotation")

    now = datetime.utcnow()
    if token_obj.expires_at <= now or session_obj.expires_at <= now:
        db.delete(session_obj)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
        
    user = session_obj.user
    if not user.is_active:
        db.delete(session_obj)
        db.commit()
        raise HTTPException(status_code=401, detail="User account is inactive")
    org_id = _ensure_user_default_org(user, db, commit=False)

    # Claim this credential with a compare-and-set. PostgreSQL row locks above
    # serialize concurrent refreshes; the conditional update also protects
    # databases that do not implement SELECT FOR UPDATE (including SQLite).
    consumed = (
        db.query(RefreshToken)
        .filter(RefreshToken.id == token_obj.id, RefreshToken.consumed_at.is_(None))
        .update({RefreshToken.consumed_at: now}, synchronize_session=False)
    )
    if consumed != 1:
        db.rollback()
        replayed = db.query(RefreshToken).filter(RefreshToken.token_hash == req_hash).first()
        replay_session = db.query(Session).filter(Session.id == token_obj.session_id).first()
        if replayed is not None and replayed.consumed_at is not None and replay_session is not None:
            db.delete(replay_session)
            db.commit()
            raise HTTPException(status_code=401, detail="Refresh token reuse detected")
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    
    # Rotate tokens
    access_token = create_access_token(
        user.id, user.email, org_id, user.global_role.value, session_id=session_obj.id
    )
    
    new_refresh_plain = secrets.token_hex(32)
    new_refresh_hash = hashlib.sha256(new_refresh_plain.encode()).hexdigest()
    
    session_obj.refresh_token_hash = new_refresh_hash
    session_obj.signing_key_version = settings.auth_key_version
    session_obj.expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(RefreshToken(
        session_id=session_obj.id,
        token_hash=new_refresh_hash,
        expires_at=session_obj.expires_at,
    ))
    
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
