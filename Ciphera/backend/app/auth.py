"""
Authentication utilities for Ciphera application.

This module handles:
1. Password hashing and verification (using bcrypt)
2. JWT token creation and verification
3. User authentication from tokens

Security Concepts:
- Hashing: One-way conversion (can't reverse)
- Salting: Random data added to password before hashing
- JWT: Signed token containing user data
- Bearer token: Token sent in Authorization header
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import TokenData

# ============================================================================
# CONFIGURATION
# ============================================================================

# Secret key for signing JWT tokens
# In production, this should be a long random string stored in environment variables
# Generate with: openssl rand -hex 32
SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"

# Algorithm used to sign the JWT
ALGORITHM = "HS256"

# Token expiration time (30 minutes)
ACCESS_TOKEN_EXPIRE_MINUTES = 30


# ============================================================================
# PASSWORD HASHING
# ============================================================================

# Password context for hashing
# bcrypt: Industry-standard hashing algorithm
# deprecated="auto": Automatically upgrade old hashes if needed
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """
    Hash a plain text password using bcrypt.
    
    How bcrypt works:
    1. Generates a random salt
    2. Combines salt + password
    3. Hashes multiple times (slow by design to prevent brute force)
    4. Returns hash that includes the salt
    
    Example:
        plain = "mypassword123"
        hashed = hash_password(plain)
        # Returns: "$2b$12$KIXxPz..." (60 characters)
    
    Args:
        password: Plain text password
        
    Returns:
        Bcrypt hash string (includes salt)
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a bcrypt hash.
    
    How verification works:
    1. Extract salt from the hash
    2. Hash the plain password with the same salt
    3. Compare the two hashes
    
    Example:
        stored_hash = "$2b$12$KIXxPz..."
        user_input = "mypassword123"
        is_valid = verify_password(user_input, stored_hash)
        # Returns: True if password matches
    
    Args:
        plain_password: Password entered by user
        hashed_password: Hash stored in database
        
    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


# ============================================================================
# JWT TOKEN MANAGEMENT
# ============================================================================

# OAuth2 scheme for extracting token from Authorization header
# tokenUrl: The endpoint where clients get tokens (our login endpoint)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.
    
    JWT Structure:
    - Header: Algorithm and token type
    - Payload: User data (email, expiration)
    - Signature: Cryptographic signature to prevent tampering
    
    Example token (decoded):
        {
            "sub": "user@example.com",  # Subject (user identifier)
            "exp": 1234567890  # Expiration timestamp
        }
    
    The token is signed with our SECRET_KEY, so it can't be tampered with.
    Anyone can READ the token (it's just base64), but they can't MODIFY it
    without invalidating the signature.
    
    Args:
        data: Dictionary of data to encode (usually {"sub": email})
        expires_delta: Optional custom expiration time
        
    Returns:
        JWT token string (looks like: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)
    """
    to_encode = data.copy()
    
    # Set expiration time
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Add expiration to the token payload
    to_encode.update({"exp": expire})
    
    # Create and sign the JWT
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Get the current authenticated user from a JWT token.
    
    This function is used as a dependency in protected routes.
    
    How it works:
    1. Extract token from Authorization header
    2. Decode and verify the token
    3. Get user email from token
    4. Look up user in database
    5. Return user object
    
    Usage in endpoints:
        @app.get("/api/users/me")
        def get_me(current_user: User = Depends(get_current_user)):
            return current_user
    
    Args:
        token: JWT token from Authorization header (auto-extracted)
        db: Database session (auto-injected)
        
    Returns:
        User object from database
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    # Exception to raise if authentication fails
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decode the JWT token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Extract email from token payload
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
            
        token_data = TokenData(email=email)
        
    except JWTError:
        # Token is invalid (expired, tampered, wrong signature, etc.)
        raise credentials_exception
    
    # Look up user in database
    user = db.query(User).filter(User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Get current user and verify they are active.
    
    This is a wrapper around get_current_user that also checks is_active.
    Use this for routes that should only be accessible to active users.
    
    Args:
        current_user: User from get_current_user dependency
        
    Returns:
        Active user object
        
    Raises:
        HTTPException: If user is inactive
    """
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """
    Authenticate a user by email and password.
    
    This is used in the login endpoint.
    
    Steps:
    1. Find user by email
    2. Verify password hash
    3. Return user if valid, None if invalid
    
    Args:
        db: Database session
        email: User's email
        password: Plain text password
        
    Returns:
        User object if authentication succeeds, None otherwise
    """
    # Find user by email
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    
    # Verify password
    if not verify_password(password, user.hashed_password):
        return None
    
    return user
