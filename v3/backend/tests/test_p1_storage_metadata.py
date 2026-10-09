import pytest
import io
import fitz
import uuid
import tempfile
import os
from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.identity import User, Organization, OrganizationMember
from app.models.document import Document, RedactionJob, JobStatus
from feature15_auth import create_access_token
from app.tasks.redaction_tasks import process_redaction
from unittest.mock import patch

client = TestClient(app)

@pytest.fixture
def p1_storage_env():
    db = SessionLocal()
    org_id = f"p1_org_{uuid.uuid4().hex[:6]}"
    user_id = f"p1_user_{uuid.uuid4().hex[:6]}"
    
    user = User(id=user_id, email=f"{user_id}@p1.test", password_hash="pwd", full_name="P1 User", is_active=True)
    org = Organization(id=org_id, name="P1 Org")
    db.add(user)
    db.add(org)
    db.commit()
    
    membership = OrganizationMember(user_id=user_id, org_id=org_id, role="admin")
    db.add(membership)
    db.commit()
    
    token = create_access_token(user_id, f"{user_id}@p1.test", org_id, "admin")
    
    yield {"token": token, "org_id": org_id, "user_id": user_id}
    
    db = SessionLocal()
    db.query(RedactionJob).filter(RedactionJob.id.like("p1_job%")).delete()
    db.query(Document).filter(Document.id.like("p1_doc%")).delete()
    db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).delete()
    db.query(Organization).filter(Organization.id == org_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    db.commit()
    db.close()

def test_successful_job_sets_result_storage_key_and_clears_error_message(p1_storage_env):
    """Successful redaction must populate result_storage_key and leave error_message None."""
    token = p1_storage_env["token"]
    user_id = p1_storage_env["user_id"]
    org_id = p1_storage_env["org_id"]
    
    # Create simple dummy PDF on disk
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text(fitz.Point(72, 100), "Public harmless document content", fontsize=12)
    temp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    doc.save(temp_pdf.name)
    doc.close()
    temp_pdf.close()
    
    db = SessionLocal()
    doc_id = f"p1_doc_{uuid.uuid4().hex[:6]}"
    job_id = f"p1_job_{uuid.uuid4().hex[:6]}"
    
    doc_record = Document(
        id=doc_id, org_id=org_id, uploaded_by=user_id,
        filename="harmless.pdf", file_type="application/pdf", storage_key=temp_pdf.name
    )
    db.add(doc_record)
    
    job_record = RedactionJob(
        id=job_id, document_id=doc_id, status=JobStatus.QUEUED
    )
    db.add(job_record)
    db.commit()
    db.close()
    
    # Process job synchronously
    res_dict = process_redaction(job_id)
    assert res_dict["status"] == "success"
    assert "result_path" in res_dict
    
    # Verify DB state
    db = SessionLocal()
    saved_job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
    assert saved_job.status == JobStatus.COMPLETED
    assert saved_job.result_storage_key is not None
    assert saved_job.result_storage_key == res_dict["result_path"]
    assert saved_job.error_message is None
    db.close()
    
    # Verify API status endpoint reflects normalized schema
    api_res = client.get(f"/api/v3/documents/redact/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"})
    assert api_res.status_code == 200
    job_data = api_res.json()
    assert job_data["status"] == "completed"
    assert job_data["result_storage_key"] == res_dict["result_path"]
    assert job_data["error_message"] is None
    
    # Verify download succeeds using result_storage_key
    dl_res = client.get(f"/api/v3/documents/redact/jobs/{job_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/pdf"
    
    if os.path.exists(temp_pdf.name):
        os.remove(temp_pdf.name)

def test_failed_job_leaves_result_storage_key_none(p1_storage_env):
    """Failed redaction sets error_message and leaves result_storage_key as None."""
    token = p1_storage_env["token"]
    user_id = p1_storage_env["user_id"]
    org_id = p1_storage_env["org_id"]
    
    db = SessionLocal()
    doc_id = f"p1_doc_{uuid.uuid4().hex[:6]}"
    job_id = f"p1_job_{uuid.uuid4().hex[:6]}"
    
    doc_record = Document(
        id=doc_id, org_id=org_id, uploaded_by=user_id,
        filename="invalid.pdf", file_type="application/pdf", storage_key="/nonexistent/path.pdf"
    )
    db.add(doc_record)
    
    job_record = RedactionJob(
        id=job_id, document_id=doc_id, status=JobStatus.QUEUED
    )
    db.add(job_record)
    db.commit()
    db.close()
    
    process_redaction(job_id)
    
    db = SessionLocal()
    failed_job = db.query(RedactionJob).filter(RedactionJob.id == job_id).first()
    assert failed_job.status == JobStatus.FAILED
    assert failed_job.result_storage_key is None
    assert failed_job.error_message is not None
    db.close()
    
    api_res = client.get(f"/api/v3/documents/redact/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"})
    assert api_res.status_code == 200
    job_data = api_res.json()
    assert job_data["status"] == "failed"
    assert job_data["result_storage_key"] is None
    assert job_data["error_message"] is not None

def test_legacy_job_fallback_in_download_endpoint(p1_storage_env):
    """Older completed jobs having result in error_message and None in result_storage_key must still download cleanly."""
    token = p1_storage_env["token"]
    user_id = p1_storage_env["user_id"]
    org_id = p1_storage_env["org_id"]
    
    # Create dummy artifact file on disk
    temp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    temp_pdf.write(b"%PDF-1.4 dummy valid bytes")
    temp_pdf.close()
    
    db = SessionLocal()
    doc_id = f"p1_doc_{uuid.uuid4().hex[:6]}"
    job_id = f"p1_job_{uuid.uuid4().hex[:6]}"
    
    doc_record = Document(
        id=doc_id, org_id=org_id, uploaded_by=user_id,
        filename="legacy.pdf", file_type="application/pdf", storage_key=temp_pdf.name
    )
    db.add(doc_record)
    
    # Simulate legacy job: result_storage_key is None, but error_message holds the storage path
    job_record = RedactionJob(
        id=job_id, document_id=doc_id, status=JobStatus.COMPLETED,
        result_storage_key=None,
        error_message=temp_pdf.name
    )
    db.add(job_record)
    db.commit()
    db.close()
    
    dl_res = client.get(f"/api/v3/documents/redact/jobs/{job_id}/download", headers={"Authorization": f"Bearer {token}"})
    assert dl_res.status_code == 200
    assert dl_res.content == b"%PDF-1.4 dummy valid bytes"
    
    if os.path.exists(temp_pdf.name):
        os.remove(temp_pdf.name)
