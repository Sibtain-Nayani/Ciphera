from pydantic import BaseModel, EmailStr, model_validator
from typing import Optional, Any
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

class UserResponse(BaseModel):
    id: str
    user_id: str
    email: EmailStr
    full_name: str
    global_role: GlobalRole
    role: str = "user"
    plan: str = "enterprise"
    is_active: bool
    created_at: datetime
    
    @model_validator(mode="before")
    @classmethod
    def populate_fields(cls, data: Any) -> Any:
        if hasattr(data, "id"):
            uid = str(data.id)
            role_val = data.global_role.value if hasattr(data.global_role, "value") else str(data.global_role)
            return {
                "id": uid,
                "user_id": uid,
                "email": data.email,
                "full_name": data.full_name,
                "global_role": data.global_role,
                "role": role_val,
                "plan": "enterprise",
                "is_active": data.is_active,
                "created_at": data.created_at,
            }
        elif isinstance(data, dict):
            uid = data.get("id") or data.get("user_id", "")
            data["id"] = uid
            data["user_id"] = uid
            if "role" not in data and "global_role" in data:
                data["role"] = data["global_role"].value if hasattr(data["global_role"], "value") else str(data["global_role"])
            data.setdefault("plan", "enterprise")
        return data

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    user_id: str
    user: UserResponse

class RefreshRequest(BaseModel):
    refresh_token: str
    device_hint: Optional[str] = None
