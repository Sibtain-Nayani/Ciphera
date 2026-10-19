import pytest
import io
import fitz
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.identity import User, Organization, OrganizationMember
from app.models.document import Document, RedactionJob, JobStatus
from app.services.verification_engine import VerificationEngine
from app.schemas.document import RedactionEntity
from feature15_auth import create_access_token
from app.tasks.redaction_tasks import process_redaction
from unittest.mock import patch

client = TestClient(app)

@pytest.fixture
def p0_test_env():
    db = SessionLocal()
    org_id = "p0_org"
    user_id = "p0_user"
    
    # Clean up previous runs
    db.query(RedactionJob).filter(RedactionJob.id.like("p0_job%")).delete()
    db.query(Document).filter(Document.id.like("p0_doc%")).delete()
    db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).delete()
    db.query(Organization).filter(Organization.id == org_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    db.commit()
    
    user = User(id=user_id, email="p0_user@security.test", password_hash="pwd", full_name="P0 Test User", is_active=True)
    org = Organization(id=org_id, name="P0 Sec Org")
    db.add(user)
    db.add(org)
    db.commit()
    
    membership = OrganizationMember(user_id=user_id, org_id=org_id, role="admin")
    db.add(membership)
    db.commit()
    
    token = create_access_token(user_id, "p0_user@security.test", org_id, "admin")
    
    yield {"token": token, "org_id": org_id, "user_id": user_id}
    
    db = SessionLocal()
    db.query(RedactionJob).filter(RedactionJob.id.like("p0_job%")).delete()
    db.query(Document).filter(Document.id.like("p0_doc%")).delete()
    db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).delete()
    db.query(Organization).filter(Organization.id == org_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    db.commit()
    db.close()

def test_verification_engine_scrubs_raw_pii_tokens():
    """Verify that VerificationEngine.sanitize_error_string eliminates all raw PII."""
    raw_message = (
        "Fatal error encountered with PAN ABCDE9999Z, Aadhaar 9999 8888 7777, "
        "email leak_user@classified.test, phone 9876543210, and card 4111 2222 3333 4444"
    )
    sanitized = VerificationEngine.sanitize_error_string(raw_message)
    
    # Sensitive tokens must NOT be present
    assert "ABCDE9999Z" not in sanitized
    assert "9999 8888 7777" not in sanitized
    assert "leak_user@classified.test" not in sanitized
    assert "9876543210" not in sanitized
    assert "4111 2222 3333 4444" not in sanitized
    
    # Generic placeholders must be present
    assert "[REDACTED_PAN]" in sanitized
    assert "[REDACTED_AADHAAR]" in sanitized
    assert "[REDACTED_EMAIL]" in sanitized
    assert "[REDACTED_PHONE]" in sanitized
    assert "[REDACTED_CARD]" in sanitized

def test_verification_failure_exception_does_not_leak_detected_pii():
    """When verification detects a leak in a PDF, the resulting exception must not leak the plaintext PII."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    secret_pan = "BNZPK9999D"
    page.insert_text(fitz.Point(72, 100), f"Subject Tax ID is {secret_pan}", fontsize=12)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    pdf_bytes = out.getvalue()
    
    with pytest.raises(Exception) as exc_info:
        # Pass empty original_entities so the verification catches the PAN as an unexpected leak
        VerificationEngine.verify_redacted_file(pdf_bytes, "test_leak.pdf", original_entities=[])
        
    error_detail = str(exc_info.value)
    # The actual PAN value must NOT appear in the exception detail
    assert secret_pan not in error_detail
    assert "PAN_CARD pattern detected" in error_detail

def test_celery_task_and_api_job_status_do_not_leak_pii(p0_test_env):
    """
    If a job fails with verification error or other exception,
    RedactionJob.error_message and GET /api/v3/documents/redact/jobs/{id}
    must not expose the sensitive token to API clients.
    """
    token = p0_test_env["token"]
    user_id = p0_test_env["user_id"]
    org_id = p0_test_env["org_id"]
    
    db = SessionLocal()
    doc_id = "p0_doc_1"
    job_id = "p0_job_1"
    
    # Document record
    doc_record = Document(
        id=doc_id, org_id=org_id, uploaded_by=user_id,
        filename="confidential.pdf", file_type="application/pdf", storage_key="/tmp/fake_p0.pdf"
    )
    db.add(doc_record)
    
    # Create job in QUEUED status
    job_record = RedactionJob(
        id=job_id, document_id=doc_id, status=JobStatus.QUEUED
    )
    db.add(job_record)
    db.commit()
    db.close()
    
    secret_aadhaar = "9876 5432 1098"
    # Mock StorageService to raise an error containing sensitive information
    with patch("app.services.storage.StorageService.get_document", side_effect=ValueError(f"Corrupted record for Aadhaar {secret_aadhaar}")):
        process_redaction(job_id)
        
    # Check database state
    db = SessionLocal()
    updated_job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
    assert updated_job.status == JobStatus.FAILED
    assert secret_aadhaar not in updated_job.error_message
    assert "[REDACTED_AADHAAR]" in updated_job.error_message
    db.close()
    
    # Query API endpoint
    res = client.get(f"/api/v3/documents/redact/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == "failed"
    assert secret_aadhaar not in res_data["error_message"]
    assert "[REDACTED_AADHAAR]" in res_data["error_message"]
    
    # Download attempt must fail with 400
    dl_res = client.get(f"/api/v3/documents/redact/jobs/{job_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert dl_res.status_code == 400
    assert "Job not completed" in dl_res.json()["detail"]
