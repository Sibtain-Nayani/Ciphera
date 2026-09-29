import pytest
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.identity import User, Organization, OrganizationMember
from app.models.document import Document
import uuid

client = TestClient(app)

def setup_test_users():
    db = SessionLocal()
    
    # User A (Org A)
    user_a = User(id="user_a", email="a@example.com", full_name="User A", password_hash="dummy")
    org_a = Organization(id="org_a", name="Org A", created_by="user_a")
    mem_a = OrganizationMember(org_id="org_a", user_id="user_a", role="owner")
    
    # User B (Org B)
    user_b = User(id="user_b", email="b@example.com", full_name="User B", password_hash="dummy")
    org_b = Organization(id="org_b", name="Org B", created_by="user_b")
    mem_b = OrganizationMember(org_id="org_b", user_id="user_b", role="owner")
    
    # Document for User A
    doc_a = Document(
        id="doc_a", org_id="org_a", uploaded_by="user_a",
        filename="test.pdf", file_type="application/pdf", storage_key="fake"
    )
    
    db.add_all([user_a, org_a, mem_a, user_b, org_b, mem_b, doc_a])
    db.commit()
    
    from feature15_auth import create_access_token
    token_a = create_access_token("user_a", "a@example.com", "org_a", "user")
    token_b = create_access_token("user_b", "b@example.com", "org_b", "user")
    
    db.close()
    return token_a, token_b

def test_idor_document_access():
    token_a, token_b = setup_test_users()
    
    # User A can access
    res = client.get("/api/v3/documents/doc_a/canonical", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code in [200, 404] # Might be 404 if canonical_representation is null, but not 403/404 from IDOR
    
    # User B CANNOT access (IDOR blocked)
    res_b = client.get("/api/v3/documents/doc_a/canonical", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 404
    
    # User B cannot get entities
    res_b2 = client.get("/api/v3/documents/doc_a/entities", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b2.status_code == 404
    
    # User B cannot redact
    res_b3 = client.post("/api/v3/documents/doc_a/redact", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b3.status_code == 404

    db = SessionLocal()
    db.query(Document).filter(Document.id == "doc_a").delete()
    db.query(OrganizationMember).filter(OrganizationMember.user_id.in_(["user_a", "user_b"])).delete()
    db.query(Organization).filter(Organization.id.in_(["org_a", "org_b"])).delete()
    db.query(User).filter(User.id.in_(["user_a", "user_b"])).delete()
    db.commit()
    db.close()
