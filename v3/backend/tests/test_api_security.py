import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.core.config import settings
from app.models.identity import User, Session, Organization, OrganizationMember
from app.models.document import Document
from app.api.auth import create_access_token
from datetime import datetime, timedelta
import hashlib
import uuid

client = TestClient(app)

def setup_test_users():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    
    # User A (Org A)
    user_a_id = f"user_a_{suffix}"
    org_a_id = f"org_a_{suffix}"
    user_a = User(id=user_a_id, email=f"a_{suffix}@example.com", full_name="User A", password_hash="dummy")
    org_a = Organization(id=org_a_id, name="Org A", created_by=user_a_id)
    db.add(user_a)
    db.add(org_a)
    db.commit()

    mem_a = OrganizationMember(org_id=org_a_id, user_id=user_a_id, role="owner")
    
    # User B (Org B)
    user_b_id = f"user_b_{suffix}"
    org_b_id = f"org_b_{suffix}"
    user_b = User(id=user_b_id, email=f"b_{suffix}@example.com", full_name="User B", password_hash="dummy")
    org_b = Organization(id=org_b_id, name="Org B", created_by=user_b_id)
    db.add(user_b)
    db.add(org_b)
    db.commit()

    mem_b = OrganizationMember(org_id=org_b_id, user_id=user_b_id, role="owner")
    
    # Document for User A
    doc_a_id = f"doc_a_{suffix}"
    doc_a = Document(
        id=doc_a_id, org_id=org_a_id, uploaded_by=user_a_id,
        filename="test.pdf", file_type="application/pdf", storage_key="fake"
    )
    
    session_a = Session(
        user_id=user_a_id,
        refresh_token_hash=hashlib.sha256(uuid.uuid4().hex.encode()).hexdigest(),
        signing_key_version=settings.auth_key_version,
        expires_at=datetime.utcnow() + timedelta(days=1),
    )
    session_b = Session(
        user_id=user_b_id,
        refresh_token_hash=hashlib.sha256(uuid.uuid4().hex.encode()).hexdigest(),
        signing_key_version=settings.auth_key_version,
        expires_at=datetime.utcnow() + timedelta(days=1),
    )
    db.add_all([mem_a, mem_b, doc_a, session_a, session_b])
    db.commit()
    db.refresh(session_a)
    db.refresh(session_b)
    
    token_a = create_access_token(
        user_a_id, f"a_{suffix}@example.com", org_a_id, "user", session_id=session_a.id
    )
    token_b = create_access_token(
        user_b_id, f"b_{suffix}@example.com", org_b_id, "user", session_id=session_b.id
    )
    
    db.close()
    return token_a, token_b, doc_a_id

def test_idor_document_access():
    token_a, token_b, doc_a_id = setup_test_users()
    
    # User A can access
    res = client.get(f"/api/v3/documents/{doc_a_id}/canonical", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200
    
    # User B CANNOT access (IDOR blocked)
    res_b = client.get(f"/api/v3/documents/{doc_a_id}/canonical", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 404

def test_unauthenticated_access_blocked():
    res = client.get("/api/v3/documents/some_doc/canonical")
    assert res.status_code in [401, 403]
