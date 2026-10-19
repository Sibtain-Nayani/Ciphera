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

def test_pdf_exact_100_pages_accepted_by_parser():
    """PDF containing exactly 100 pages (the configured upper limit) must be accepted."""
    doc = fitz.open()
    for i in range(100):
        p = doc.new_page(width=300, height=300)
        p.insert_text(fitz.Point(30, 30), f"Page {i+1}")
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    pdf_bytes = out.getvalue()
    
    canonical = DocumentParser.parse(pdf_bytes, "boundary_100_pages.pdf")
    assert canonical.page_count == 100

def test_pdf_exceeding_page_limit_rejected_by_parser():
    """PDF containing more than MAX_PDF_PAGE_COUNT pages (101 pages) must be rejected with HTTP 400."""
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

def test_upload_exact_25mib_accepted_and_25mib_plus_one_byte_rejected(p1_resource_env):
    """
    Boundary test for upload size:
    Exactly 25 MiB (26,214,400 bytes) valid PDF must be accepted (HTTP 200).
    25 MiB + 1 byte (26,214,401 bytes) must be rejected with HTTP 413.
    """
    token = p1_resource_env["token"]
    org_id = p1_resource_env["org_id"]
    
    # Generate base valid PDF
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    page.insert_text(fitz.Point(50, 50), "25MB Boundary Test Valid PDF")
    base_bytes = doc.tobytes()
    doc.close()
    
    exact_limit = settings.MAX_UPLOAD_SIZE_BYTES  # 26,214,400 bytes
    pad_len = exact_limit - len(base_bytes)
    assert pad_len > 0, "Base PDF must be smaller than 25MB"
    
    # Trailing comment padding preserves PDF structural validity under PyMuPDF
    valid_25mib = base_bytes + b"\n%" + (b"0" * (pad_len - 2))
    assert len(valid_25mib) == exact_limit
    
    # 1. Exactly 25 MiB: should be accepted
    files_exact = {"file": ("exact_25mib.pdf", valid_25mib, "application/pdf")}
    res_exact = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files=files_exact,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_exact.status_code == 200, f"Expected 200 for exact 25MB but got {res_exact.status_code}: {res_exact.text}"
    
    # 2. 25 MiB + 1 byte: should be rejected with 413
    oversized_25mib_plus_one = valid_25mib + b"X"
    assert len(oversized_25mib_plus_one) == exact_limit + 1
    
    files_oversized = {"file": ("oversized_25mib.pdf", oversized_25mib_plus_one, "application/pdf")}
    res_oversized = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files=files_oversized,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_oversized.status_code == 413
    assert "exceeds maximum upload limit" in res_oversized.json()["detail"].lower()

def test_rejected_uploads_leave_no_orphaned_storage_files(p1_resource_env):
    """
    Verify that rejected uploads (corrupt, encrypted, over page limit, empty)
    never create or leave behind orphan files in storage directory.
    """
    import os
    token = p1_resource_env["token"]
    org_id = p1_resource_env["org_id"]
    upload_dir = os.path.join(settings.LOCAL_STORAGE_DIR, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    # Snapshot files before tests
    initial_files = set(os.listdir(upload_dir))
    
    # Case A: 101-page PDF
    doc = fitz.open()
    for _ in range(101):
        doc.new_page()
    pdf_101 = doc.tobytes()
    doc.close()
    res_a = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files={"file": ("page_limit_fail.pdf", pdf_101, "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_a.status_code == 400
    assert set(os.listdir(upload_dir)) == initial_files, "101-page rejected PDF left an orphan storage file!"
    
    # Case B: Corrupted PDF header
    res_b = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files={"file": ("corrupt.pdf", b"NOT_A_PDF_CORRUPT_BYTES", "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_b.status_code == 400
    assert set(os.listdir(upload_dir)) == initial_files, "Corrupted rejected PDF left an orphan storage file!"
    
    # Case C: Password-protected encrypted PDF
    doc_enc = fitz.open()
    doc_enc.new_page().insert_text(fitz.Point(50, 50), "Classified")
    out = io.BytesIO()
    doc_enc.save(out, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="pwd123")
    doc_enc.close()
    res_c = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files={"file": ("encrypted.pdf", out.getvalue(), "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_c.status_code == 400
    assert set(os.listdir(upload_dir)) == initial_files, "Encrypted rejected PDF left an orphan storage file!"
    
    # Case D: Empty file (0 bytes)
    res_d = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files={"file": ("empty.pdf", b"", "application/pdf")},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_d.status_code == 400
    assert set(os.listdir(upload_dir)) == initial_files, "Empty rejected file left an orphan storage file!"

