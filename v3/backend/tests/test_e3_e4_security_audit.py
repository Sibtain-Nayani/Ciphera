import io
import pytest
import fitz
from fastapi import HTTPException
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.identity import User, Organization, OrganizationMember
from app.models.document import Document, RedactionJob, JobStatus
from app.schemas.document import RedactionEntity, BoundingBox
from app.services.verification_engine import VerificationEngine
from app.services.verification_geometry import GeometryVerifier
from app.services.verification_visual import VisualVerifier
from feature15_auth import create_access_token

client = TestClient(app)

def create_pdf(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(fitz.Point(72, 100), text, fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()

# ==========================================
# E3: Verification Engine Separation Tests
# ==========================================

def test_verification_catches_unredacted_pan():
    """Checker independently catches unredacted PAN."""
    pdf_bytes = create_pdf("Income Tax PAN: ABCDE1234F")
    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(pdf_bytes, "test.pdf", [])
    assert exc_info.value.status_code == 500
    assert "PAN" in str(exc_info.value.detail)

def test_verification_catches_unredacted_aadhaar():
    """Checker independently catches unredacted Aadhaar."""
    pdf_bytes = create_pdf("Aadhaar: 4532 8812 9901")
    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(pdf_bytes, "test.pdf", [])
    assert exc_info.value.status_code == 500
    assert "AADHAAR" in str(exc_info.value.detail)

def test_verification_catches_spatial_fragmentation_leak():
    """Checker catches spaced fragmented Aadhaar leak."""
    pdf_bytes = create_pdf("Aadhaar: 1 1 2 2   3 3 4 4   5 5 6 6")
    with pytest.raises(HTTPException) as exc_info:
        VerificationEngine.verify_redacted_file(pdf_bytes, "test.pdf", [])
    assert exc_info.value.status_code == 500
    assert "Defrag Leak" in str(exc_info.value.detail) or "AADHAAR" in str(exc_info.value.detail)

def test_geometry_verifier_catches_residual_text():
    """GeometryVerifier flags when text remains inside expected redaction bbox."""
    pdf_bytes = create_pdf("Secret Content")
    entity = RedactionEntity(
        id="ent_1",
        text="Secret",
        entity_type="PERSON",
        score=0.95,
        page_num=1,
        bbox=BoundingBox(x0=50, y0=50, x1=200, y1=150),
        status="accepted"
    )
    leaks = GeometryVerifier.verify(pdf_bytes, [entity])
    assert len(leaks) >= 1
    assert "Expected wiped region contains" in leaks[0]

def test_verification_passes_clean_redacted_doc():
    """Verification passes when all text is cleanly wiped."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(fitz.Point(72, 100), "Public non-sensitive text only.", fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    clean_bytes = out.getvalue()
    doc.close()
    
    assert VerificationEngine.verify_redacted_file(clean_bytes, "clean.pdf", []) is True

# ==========================================
# E4: Security & Tenant Isolation Audits
# ==========================================

@pytest.fixture(scope="module")
def multi_tenant_setup():
    db = SessionLocal()
    try:
        # 1. Clean existing records if any
        db.query(RedactionJob).filter(RedactionJob.id == "sec_job_a").delete()
        db.query(Document).filter(Document.id == "sec_doc_a").delete()
        db.query(OrganizationMember).filter(OrganizationMember.user_id.in_(["sec_user_a", "sec_user_b"])).delete()
        db.query(Organization).filter(Organization.id.in_(["sec_org_a", "sec_org_b"])).delete()
        db.query(User).filter(User.id.in_(["sec_user_a", "sec_user_b"])).delete()
        db.commit()

        # 2. Create Users
        user_a = User(id="sec_user_a", email="sec_a@tenant.com", full_name="User A", password_hash="dummy")
        user_b = User(id="sec_user_b", email="sec_b@tenant.com", full_name="User B", password_hash="dummy")
        db.add_all([user_a, user_b])
        db.commit()

        # 3. Create Organizations
        org_a = Organization(id="sec_org_a", name="Tenant Alpha", created_by="sec_user_a")
        org_b = Organization(id="sec_org_b", name="Tenant Beta", created_by="sec_user_b")
        db.add_all([org_a, org_b])
        db.commit()

        # 4. Create Memberships
        mem_a = OrganizationMember(org_id="sec_org_a", user_id="sec_user_a", role="owner")
        mem_b = OrganizationMember(org_id="sec_org_b", user_id="sec_user_b", role="owner")
        db.add_all([mem_a, mem_b])
        db.commit()
        
        # 5. Create Documents and Jobs
        doc_a = Document(
            id="sec_doc_a", org_id="sec_org_a", uploaded_by="sec_user_a",
            filename="tenant_a_confidential.pdf", file_type="application/pdf", storage_key="/tmp/fake_a.pdf"
        )
        db.add(doc_a)
        db.commit()

        job_a = RedactionJob(
            id="sec_job_a", document_id="sec_doc_a", status=JobStatus.FAILED, error_message="Verification failed: leak detected"
        )
        db.add(job_a)
        db.commit()
    finally:
        db.close()
    
    token_a = create_access_token("sec_user_a", "sec_a@tenant.com", "sec_org_a", "user")
    token_b = create_access_token("sec_user_b", "sec_b@tenant.com", "sec_org_b", "user")
    
    yield {"token_a": token_a, "token_b": token_b}
    
    # Cleanup
    db = SessionLocal()
    try:
        db.query(RedactionJob).filter(RedactionJob.id == "sec_job_a").delete()
        db.query(Document).filter(Document.id == "sec_doc_a").delete()
        db.query(OrganizationMember).filter(OrganizationMember.user_id.in_(["sec_user_a", "sec_user_b"])).delete()
        db.query(Organization).filter(Organization.id.in_(["sec_org_a", "sec_org_b"])).delete()
        db.query(User).filter(User.id.in_(["sec_user_a", "sec_user_b"])).delete()
        db.commit()
    finally:
        db.close()

def test_tenant_isolation_cross_tenant_read_blocked(multi_tenant_setup):
    token_b = multi_tenant_setup["token_b"]
    # Tenant B tries to access Tenant A's document canonical representation -> 404 (IDOR protected)
    res = client.get("/api/v3/documents/sec_doc_a/canonical", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 404

def test_tenant_isolation_cross_tenant_entities_blocked(multi_tenant_setup):
    token_b = multi_tenant_setup["token_b"]
    # Tenant B tries to read Tenant A's detected entities -> 404
    res = client.get("/api/v3/documents/sec_doc_a/entities", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 404

def test_tenant_isolation_cross_tenant_redaction_blocked(multi_tenant_setup):
    token_b = multi_tenant_setup["token_b"]
    # Tenant B tries to trigger redaction on Tenant A's doc -> 404
    res = client.post("/api/v3/documents/sec_doc_a/redact", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 404

def test_failed_verification_job_download_blocked(multi_tenant_setup):
    token_a = multi_tenant_setup["token_a"]
    # Download on a FAILED job must be blocked with 400 Bad Request
    res = client.get("/api/v3/documents/redact/jobs/sec_job_a/download", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 400
    assert "Job not completed" in res.json()["detail"]

def test_security_headers_present():
    res = client.get("/health")
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Strict-Transport-Security") is not None
    assert "default-src 'self'" in res.headers.get("Content-Security-Policy", "")
