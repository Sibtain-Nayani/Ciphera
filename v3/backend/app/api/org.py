from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
import jwt

from app.core.config import settings
from app.core.database import get_db
from app.models.identity import User, Organization, OrganizationMember, OrgRole
from app.schemas.org import OrgCreate, OrgResponse, MemberResponse, InviteRequest, InviteAcceptRequest, UpdateRoleRequest
from app.api.auth import get_current_user

router = APIRouter(prefix="/api/v3/org", tags=["Organizations (SQLAlchemy)"])

@router.post("/create", response_model=OrgResponse, status_code=201)
def create_org(org_in: OrgCreate, db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check if user already owns an org (optional rule, but often common)
    # We will just allow it for now.
    org = Organization(
        name=org_in.name,
        created_by=current_user.id
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    
    # Add creator as owner
    member = OrganizationMember(
        org_id=org.id,
        user_id=current_user.id,
        role=OrgRole.OWNER
    )
    db.add(member)
    db.commit()
    
    return OrgResponse(
        id=org.id,
        name=org.name,
        created_by=org.created_by,
        created_at=org.created_at,
        my_role=OrgRole.OWNER
    )

@router.get("/me", response_model=list[OrgResponse])
def get_my_orgs(db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    memberships = db.query(OrganizationMember).filter(OrganizationMember.user_id == current_user.id).all()
    orgs = []
    for m in memberships:
        org = m.organization
        orgs.append(OrgResponse(
            id=org.id,
            name=org.name,
            created_by=org.created_by,
            created_at=org.created_at,
            my_role=m.role
        ))
    return orgs

@router.get("/{org_id}/members", response_model=list[MemberResponse])
def get_org_members(org_id: str, db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check if user is in org
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.org_id == org_id, 
        OrganizationMember.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
        
    members = db.query(OrganizationMember).filter(OrganizationMember.org_id == org_id).all()
    res = []
    for m in members:
        res.append(MemberResponse(
            user_id=m.user.id,
            email=m.user.email,
            full_name=m.user.full_name,
            role=m.role,
            joined_at=m.joined_at
        ))
    return res

@router.post("/{org_id}/invite")
def invite_member(org_id: str, req: InviteRequest, db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check permissions
    membership = db.query(OrganizationMember).filter(
        OrganizationMember.org_id == org_id, 
        OrganizationMember.user_id == current_user.id
    ).first()
    
    if not membership or membership.role not in [OrgRole.OWNER, OrgRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to invite")
        
    # In a real app, we would send an email with a JWT token or a random string stored in DB
    # For now, we return a mock token just like the old implementation
    token = jwt.encode(
        {"org_id": org_id, "email": req.email, "role": req.role.value, "exp": datetime.utcnow().timestamp() + 86400 * 7},
        settings.SECRET_KEY, 
        algorithm=settings.ALGORITHM
    )
    
    return {"message": f"Invite sent to {req.email}", "token": token}

@router.post("/accept-invite")
def accept_invite(req: InviteAcceptRequest, db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        payload = jwt.decode(req.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        org_id = payload.get("org_id")
        email = payload.get("email")
        role_str = payload.get("role")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")
        
    if current_user.email != email:
        raise HTTPException(status_code=403, detail="This invite is not for you")
        
    # Check if already a member
    existing = db.query(OrganizationMember).filter(
        OrganizationMember.org_id == org_id, 
        OrganizationMember.user_id == current_user.id
    ).first()
    if existing:
        return {"message": "Already a member"}
        
    member = OrganizationMember(
        org_id=org_id,
        user_id=current_user.id,
        role=OrgRole(role_str)
    )
    db.add(member)
    db.commit()
    
    return {"message": "Joined organization successfully"}
