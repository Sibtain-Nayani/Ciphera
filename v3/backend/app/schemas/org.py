from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.identity import OrgRole

class OrgCreate(BaseModel):
    name: str

class MemberResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: OrgRole
    joined_at: datetime
    
    class Config:
        from_attributes = True

class OrgResponse(BaseModel):
    id: str
    name: str
    created_by: Optional[str] = None
    created_at: datetime
    my_role: Optional[OrgRole] = None
    members: Optional[List[MemberResponse]] = None
    
    class Config:
        from_attributes = True
        
class InviteRequest(BaseModel):
    email: str
    role: OrgRole = OrgRole.MEMBER

class InviteAcceptRequest(BaseModel):
    token: str

class UpdateRoleRequest(BaseModel):
    role: OrgRole
