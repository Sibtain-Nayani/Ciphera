from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models.identity import GlobalRole

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_hint: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str

class RefreshRequest(BaseModel):
    refresh_token: str
    device_hint: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    global_role: GlobalRole
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True
