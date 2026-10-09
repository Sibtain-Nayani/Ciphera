import pytest
import io
import fitz
import uuid
from fastapi.testclient import TestClient
from fastapi import HTTPException
from main import app
from app.core.database import SessionLocal
from app.models.identity import User, Organization, OrganizationMember
from app.models.document import Document, RedactionJob
from feature15_auth import create_access_token
from app.services.document_parser import DocumentParser
from app.core.config import settings

client = TestClient(app)

@pytest.fixture
def p1_resource_env():
    db = SessionLocal()
    org_id = f"p1_lim_org_{uuid.uuid4().hex[:6]}"
    user_id = f"p1_lim_usr_{uuid.uuid4().hex[:6]}"
    
    user = User(id=user_id, email=f"{user_id}@limit.test", password_hash="pwd", full_name="Limit Test User", is_active=True)
    org = Organization(id=org_id, name="Limit Test Org")
    db.add(user)
    db.add(org)
    db.commit()
    
    membership = OrganizationMember(user_id=user_id, org_id=org_id, role="admin")
    db.add(membership)
    db.commit()
    
    token = create_access_token(user_id, f"{user_id}@limit.test", org_id, "admin")
    
    yield {"token": token, "org_id": org_id, "user_id": user_id}
    
    db = SessionLocal()
    db.query(RedactionJob).filter(RedactionJob.id.like("p1_%")).delete()
    db.query(Document).filter(Document.id.like("p1_%")).delete()
    db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).delete()
    db.query(Organization).filter(Organization.id == org_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    db.commit()
    db.close()

def test_upload_exceeding_size_limit_returns_413(p1_resource_env, monkeypatch):
    """Uploaded payload exceeding MAX_UPLOAD_SIZE_BYTES returns HTTP 413 Payload Too Large."""
    token = p1_resource_env["token"]
    org_id = p1_resource_env["org_id"]
    
    # Temporarily set MAX_UPLOAD_SIZE_BYTES to 100KB to test stream truncation quickly
    test_limit = 100 * 1024
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", test_limit)
    
    # Create payload that is 150KB
    oversized_data = b"X" * (150 * 1024)
    files = {"file": ("oversized.pdf", oversized_data, "application/pdf")}
    
    res = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 413
    assert "exceeds maximum upload limit" in res.json()["detail"].lower()

def test_upload_under_size_limit_proceeds(p1_resource_env):
    """Valid PDF within normal size limit processes successfully."""
    token = p1_resource_env["token"]
    org_id = p1_resource_env["org_id"]
    
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(fitz.Point(72, 100), "Normal allowable upload file", fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    pdf_bytes = out.getvalue()
    
    files = {"file": ("normal.pdf", pdf_bytes, "application/pdf")}
    res = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "document_id" in data
    assert data["page_count"] == 1

def test_pdf_exceeding_page_limit_rejected_by_parser():
    """PDF containing more than MAX_PDF_PAGE_COUNT pages must be rejected with HTTP 400."""
    # Create 101 page PDF
    doc = fitz.open()
    for i in range(101):
        p = doc.new_page(width=300, height=300)
        p.insert_text(fitz.Point(30, 30), f"Page {i+1}")
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    pdf_bytes = out.getvalue()
    
    with pytest.raises(HTTPException) as exc_info:
        DocumentParser.parse(pdf_bytes, "huge_101_pages.pdf")
        
    assert exc_info.value.status_code == 400
    assert "exceeds maximum allowed limit of 100 pages" in exc_info.value.detail

def test_pdf_within_page_limit_accepted_by_parser():
    """PDF containing 10 pages must parse cleanly."""
    doc = fitz.open()
    for i in range(10):
        p = doc.new_page(width=300, height=300)
        p.insert_text(fitz.Point(30, 30), f"Page {i+1}")
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    pdf_bytes = out.getvalue()
    
    canonical = DocumentParser.parse(pdf_bytes, "valid_10_pages.pdf")
    assert canonical.page_count == 10
    assert len(canonical.blocks) >= 10
