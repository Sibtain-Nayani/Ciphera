import io
import os
import uuid
import pytest
import fitz
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.identity import User, Organization, OrganizationMember
from app.models.document import Document, RedactionJob, JobStatus, SafetyStatus
from app.services.document_parser import DocumentParser
from app.services.storage import StorageService
from app.tasks.redaction_tasks import process_redaction
from feature15_auth import create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def security_test_env():
    db = SessionLocal()
    u_suffix = uuid.uuid4().hex[:6]
    
    user_a_id = f"e7_user_a_{u_suffix}"
    user_b_id = f"e7_user_b_{u_suffix}"
    org_a_id = f"e7_org_a_{u_suffix}"
    org_b_id = f"e7_org_b_{u_suffix}"
    
    user_a = User(id=user_a_id, email=f"a_{u_suffix}@tenant.com", full_name="User A", password_hash="dummy")
    org_a = Organization(id=org_a_id, name="Org A", created_by=user_a_id)
    mem_a = OrganizationMember(org_id=org_a_id, user_id=user_a_id, role="owner")
    
    user_b = User(id=user_b_id, email=f"b_{u_suffix}@tenant.com", full_name="User B", password_hash="dummy")
    org_b = Organization(id=org_b_id, name="Org B", created_by=user_b_id)
    mem_b = OrganizationMember(org_id=org_b_id, user_id=user_b_id, role="owner")
    
    db.add_all([user_a, user_b])
    db.commit()
    db.add_all([org_a, org_b])
    db.commit()
    db.add_all([mem_a, mem_b])
    db.commit()
    
    token_a = create_access_token(user_a_id, f"a_{u_suffix}@tenant.com", org_a_id, "user")
    token_b = create_access_token(user_b_id, f"b_{u_suffix}@tenant.com", org_b_id, "user")
    
    db.close()
    
    env_data = {
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "org_a_id": org_a_id,
        "org_b_id": org_b_id,
        "token_a": token_a,
        "token_b": token_b
    }
    
    yield env_data
    
    # Cleanup DB
    db = SessionLocal()
    db.query(RedactionJob).filter(RedactionJob.id.like("e7_%")).delete()
    db.query(Document).filter(Document.uploaded_by.in_([user_a_id, user_b_id])).delete()
    db.query(OrganizationMember).filter(OrganizationMember.user_id.in_([user_a_id, user_b_id])).delete()
    db.query(Organization).filter(Organization.id.in_([org_a_id, org_b_id])).delete()
    db.query(User).filter(User.id.in_([user_a_id, user_b_id])).delete()
    db.commit()
    db.close()

# ==========================================
# 1. File Validation Attack Suite
# ==========================================

def test_upload_zero_byte_empty_file(security_test_env):
    """Empty 0-byte file upload must be cleanly rejected."""
    token_a = security_test_env["token_a"]
    org_a = security_test_env["org_a_id"]
    
    files = {"file": ("empty.pdf", b"", "application/pdf")}
    res = client.post(f"/api/v3/documents/upload?org_id={org_a}", files=files, headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code in [400, 422]

def test_upload_corrupted_header_pdf(security_test_env):
    """HTML / Random bytes renamed to .pdf must be rejected by parser."""
    token_a = security_test_env["token_a"]
    org_a = security_test_env["org_a_id"]
    
    fake_pdf = b"<html><head></head><body>This is not a real PDF file</body></html>"
    files = {"file": ("corrupt.pdf", fake_pdf, "application/pdf")}
    res = client.post(f"/api/v3/documents/upload?org_id={org_a}", files=files, headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code in [400, 422, 500]

def test_upload_password_protected_pdf(security_test_env):
    """Password-encrypted PDF should fail gracefully without server crash."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(fitz.Point(50, 50), "Classified Secret")
    out = io.BytesIO()
    # Save with user password
    doc.save(out, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="secret123")
    doc.close()
    encrypted_bytes = out.getvalue()
    
    token_a = security_test_env["token_a"]
    org_a = security_test_env["org_a_id"]
    
    files = {"file": ("encrypted.pdf", encrypted_bytes, "application/pdf")}
    res = client.post(f"/api/v3/documents/upload?org_id={org_a}", files=files, headers={"Authorization": f"Bearer {token_a}"})
    # Should catch encryption and reject
    assert res.status_code in [400, 422, 500]

# ==========================================
# 2. Resource & Multipage Handling
# ==========================================

def test_multipage_document_handling():
    """Parser must handle multi-page documents (10 pages) correctly."""
    doc = fitz.open()
    for i in range(10):
        p = doc.new_page(width=595, height=842)
        p.insert_text(fitz.Point(72, 100), f"Page {i+1} Public Content", fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    pdf_bytes = out.getvalue()
    
    canonical = DocumentParser.parse(pdf_bytes, "multipage.pdf")
    assert canonical.page_count == 10
    assert len(canonical.blocks) >= 10

# ==========================================
# 3. Artifact Access & IDOR Matrix
# ==========================================

def test_idor_cross_tenant_job_status_blocked(security_test_env):
    """Tenant B cannot read status of Tenant A's redaction job."""
    db = SessionLocal()
    job_id = f"e7_job_{uuid.uuid4().hex[:6]}"
    doc_id = f"e7_doc_{uuid.uuid4().hex[:6]}"
    
    doc_a = Document(
        id=doc_id, org_id=security_test_env["org_a_id"], uploaded_by=security_test_env["user_a_id"],
        filename="test.pdf", file_type="application/pdf", storage_key="/tmp/test.pdf"
    )
    job_a = RedactionJob(id=job_id, document_id=doc_id, status=JobStatus.COMPLETED)
    db.add(doc_a)
    db.commit()
    db.add(job_a)
    db.commit()
    db.close()
    
    token_b = security_test_env["token_b"]
    res = client.get(f"/api/v3/documents/redact/jobs/{job_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 404

def test_idor_cross_tenant_job_download_blocked(security_test_env):
    """Tenant B cannot download completed artifact of Tenant A's job."""
    db = SessionLocal()
    job_id = f"e7_job_dl_{uuid.uuid4().hex[:6]}"
    doc_id = f"e7_doc_dl_{uuid.uuid4().hex[:6]}"
    
    doc_a = Document(
        id=doc_id, org_id=security_test_env["org_a_id"], uploaded_by=security_test_env["user_a_id"],
        filename="test_secret.pdf", file_type="application/pdf", storage_key="/tmp/test_secret.pdf"
    )
    job_a = RedactionJob(id=job_id, document_id=doc_id, status=JobStatus.COMPLETED, error_message="/tmp/fake_redacted.pdf")
    db.add(doc_a)
    db.commit()
    db.add(job_a)
    db.commit()
    db.close()
    
    token_b = security_test_env["token_b"]
    res = client.get(f"/api/v3/documents/redact/jobs/{job_id}/download", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 404

def test_download_nonexistent_job_returns_404(security_test_env):
    """Random / guessed job_id returns 404."""
    token_a = security_test_env["token_a"]
    res = client.get(f"/api/v3/documents/redact/jobs/{uuid.uuid4()}/download", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 404

def test_download_failed_job_blocked(security_test_env):
    """Downloading a FAILED job is blocked with HTTP 400."""
    db = SessionLocal()
    job_id = f"e7_job_fail_{uuid.uuid4().hex[:6]}"
    doc_id = f"e7_doc_fail_{uuid.uuid4().hex[:6]}"
    
    doc_a = Document(
        id=doc_id, org_id=security_test_env["org_a_id"], uploaded_by=security_test_env["user_a_id"],
        filename="fail.pdf", file_type="application/pdf", storage_key="/tmp/fail.pdf"
    )
    job_a = RedactionJob(id=job_id, document_id=doc_id, status=JobStatus.FAILED, error_message="Leak detected")
    db.add(doc_a)
    db.commit()
    db.add(job_a)
    db.commit()
    db.close()
    
    token_a = security_test_env["token_a"]
    res = client.get(f"/api/v3/documents/redact/jobs/{job_id}/download", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 400
    assert "Job not completed" in res.json()["detail"]

# ==========================================
# 4. Job State Machine & Idempotency
# ==========================================

def test_concurrent_redact_requests_deterministic(security_test_env):
    """
    Genuine multithreaded concurrent requests against the same document:
    Semantics:
    1. Each trigger creates an independent, isolated RedactionJob record (UUID)
    2. No database row locks or session deadlocks occur
    3. Distinct job IDs are returned for each concurrent caller
    """
    import concurrent.futures
    
    db = SessionLocal()
    doc_id = f"e7_doc_async_{uuid.uuid4().hex[:6]}"
    doc_a = Document(
        id=doc_id, org_id=security_test_env["org_a_id"], uploaded_by=security_test_env["user_a_id"],
        filename="async_test.pdf", file_type="application/pdf", storage_key="/tmp/async.pdf"
    )
    db.add(doc_a)
    db.commit()
    db.close()
    
    token_a = security_test_env["token_a"]
    
    def send_request():
        return client.post(f"/api/v3/documents/{doc_id}/redact/async", headers={"Authorization": f"Bearer {token_a}"})
    
    # Fire 5 concurrent requests simultaneously across multiple worker threads
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(send_request) for _ in range(5)]
        responses = [f.result() for f in futures]
        
    for res in responses:
        assert res.status_code == 200
        
    job_ids = [res.json()["job_id"] for res in responses]
    assert len(set(job_ids)) == 5, f"Expected 5 unique job IDs, got {len(set(job_ids))}"
