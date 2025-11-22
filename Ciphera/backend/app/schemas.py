"""
Pydantic schemas for request/response validation.

Pydantic models are used to:
1. Validate incoming request data
2. Serialize outgoing response data
3. Auto-generate API documentation

Key Difference from SQLAlchemy Models:
- SQLAlchemy models (models.py): Database tables
- Pydantic schemas (schemas.py): API data validation

Why separate?
- Security: Don't accidentally send passwords to frontend!
- Validation: Ensure data meets requirements before saving
- Documentation: FastAPI uses these for automatic API docs
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserBase(BaseModel):
    """
    Base user schema with common fields.
    Other schemas will inherit from this.
    """
    email: EmailStr  # EmailStr automatically validates email format
    full_name: Optional[str] = None  # Optional field (can be None)


class UserCreate(UserBase):
    """
    Schema for creating a new user (registration).
    
    Used in POST /api/register endpoint.
    
    Example request body:
        {
            "email": "user@example.com",
            "password": "securepassword123",
            "full_name": "John Doe"
        }
    
    Note: password is plain text here (sent over HTTPS)
    We'll hash it before saving to database
    """
    password: str = Field(
        ...,  # ... means required field
        min_length=8,  # Minimum 8 characters
        description="User password (min 8 characters)"
    )


class UserResponse(UserBase):
    """
    Schema for returning user data.
    
    IMPORTANT: This does NOT include the password!
    Never send passwords (even hashed) to the frontend.
    
    Used in:
    - GET /api/users/me (get current user)
    - POST /api/register (return created user)
    
    Example response:
        {
            "id": 1,
            "email": "user@example.com",
            "full_name": "John Doe",
            "is_active": true,
            "created_at": "2024-01-15T10:30:00"
        }
    """
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        """
        Pydantic configuration.
        
        from_attributes=True (formerly orm_mode=True):
        Allows Pydantic to read data from SQLAlchemy models.
        
        Without this, you'd have to manually convert:
            UserResponse(id=user.id, email=user.email, ...)
        
        With this, you can just do:
            UserResponse.from_orm(user)
        """
        from_attributes = True


class Token(BaseModel):
    """
    Schema for JWT token response.
    
    Used in POST /api/token (login endpoint).
    
    This follows the OAuth2 standard format.
    
    Example response:
        {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "bearer"
        }
    
    The frontend will use this token in the Authorization header:
        Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    """
    access_token: str
    token_type: str = "bearer"  # Always "bearer" for JWT


class TokenData(BaseModel):
    """
    Schema for data stored inside the JWT token.
    
    When we create a JWT, we encode user information into it.
    When we verify a JWT, we decode it back to this format.
    
    We only store the email (not password!) in the token.
    The token is signed, so it can't be tampered with.
    
    Example token payload:
        {
            "sub": "user@example.com",  # "sub" is OAuth2 standard for subject
            "exp": 1234567890  # Expiration timestamp (added automatically)
        }
    """
    email: Optional[str] = None


class UserLogin(BaseModel):
    """
    Schema for login request.
    
    Note: FastAPI's OAuth2PasswordRequestForm expects 'username' and 'password'
    fields, so we'll use that directly in the endpoint instead of this schema.
    
    This schema is here for documentation purposes.
    """
    email: str
    password: str


class JobCreate(BaseModel):
    """Schema for creating a new job."""
    source: str
    technique: str
    entity_count: int
    status: str


class JobResponse(JobCreate):
    """Schema for returning job data."""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
