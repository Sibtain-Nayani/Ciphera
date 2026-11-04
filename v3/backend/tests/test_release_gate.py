"""Release-path regression tests for routes that must not bypass async jobs."""

import hashlib
import uuid
from datetime import datetime, timedelta

import pytest
import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.api.auth import create_access_token
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.models.document import Document, JobStatus, RedactionJob, SafetyStatus
from app.models.identity import Organization, OrganizationMember, Session, User
from app.services.redaction_engine import SecureRedactionEngine
from app.services.release_gate import assert_document_matches_job_snapshot, canonical_sha256
from app.tasks.redaction_tasks import process_redaction
from feature8_api_keys import require_api_key
from main import app


client = TestClient(app)
Base.metadata.create_all(bind=engine)


@pytest.fixture
def owned_document():
    suffix = uuid.uuid4().hex
    user_id = f"release_user_{suffix}"
    org_id = f"release_org_{suffix}"
    document_id = f"release_doc_{suffix}"
    session = Session(
        user_id=user_id,
        refresh_token_hash=hashlib.sha256(uuid.uuid4().hex.encode()).hexdigest(),
        signing_key_version=settings.auth_key_version,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db = SessionLocal()
    try:
        user = User(
            id=user_id,
            email=f"{suffix}@release-test.example",
            full_name="Release Test User",
            password_hash="unused",
        )
        org = Organization(id=org_id, name="Release Test Org", created_by=user_id)
        db.add_all([user, org])
        db.commit()
        db.add_all([
            OrganizationMember(org_id=org_id, user_id=user_id, role="owner"),
            session,
            Document(
                id=document_id,
                org_id=org_id,
                uploaded_by=user_id,
                filename="release-test.pdf",
                file_type="application/pdf",
                # This legacy route must be rejected before touching storage.
                storage_key="missing-release-test.pdf",
                source_sha256=hashlib.sha256(b"synthetic source").hexdigest(),
                canonical_representation={"metadata": {"redaction_policy": {"mode": "balanced", "version": "balanced-v1"}}},
                detected_entities=[],
            ),
        ])
        db.commit()
        access_token = create_access_token(
            user_id, user.email, org_id, "user", session_id=session.id
        )
        yield document_id, access_token
    finally:
        db.rollback()
        db.query(RedactionJob).filter(
            RedactionJob.document_id == document_id
        ).delete(synchronize_session=False)
        db.query(Document).filter(Document.id == document_id).delete(synchronize_session=False)
        db.query(Session).filter(Session.user_id == user_id).delete(synchronize_session=False)
        db.query(OrganizationMember).filter(OrganizationMember.user_id == user_id).delete(synchronize_session=False)
        db.query(Organization).filter(Organization.id == org_id).delete(synchronize_session=False)
        db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_synchronous_document_export_is_disabled(owned_document):
    document_id, access_token = owned_document

    response = client.post(
        f"/api/v3/documents/{document_id}/redact",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 410
    assert "redact/async" in response.json()["detail"]


def test_standalone_pdf_download_is_disabled():
    response = client.post(
        "/api/v3/redact-pdf",
        files={"file": ("clean.pdf", b"untrusted upload bytes", "application/pdf")},
    )

    assert response.status_code == 410
    assert "documents/upload" in response.json()["detail"]
    assert "content-disposition" not in response.headers


@pytest.mark.parametrize(
    "path",
    ["/api/v3/redact-image", "/api/v3/redact-image/download"],
)
def test_standalone_image_exports_are_disabled(path):
    response = client.post(
        path,
        files={"file": ("image.png", b"untrusted upload bytes", "image/png")},
    )

    assert response.status_code == 410
    assert "detect-faces" in response.json()["detail"]
    assert "content-disposition" not in response.headers


def test_face_detection_returns_annotations_without_image_bytes():
    ok, encoded = cv2.imencode(".png", np.zeros((16, 16, 3), dtype=np.uint8))
    assert ok

    response = client.post(
        "/api/v3/detect-faces",
        data={"sensitivity": "medium"},
        files={"file": ("image.png", encoded.tobytes(), "image/png")},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert set(payload) == {"face_count", "faces", "original_size", "detector"}


def test_public_text_redaction_export_is_disabled_until_verified():
    previous_override = app.dependency_overrides.get(require_api_key)
    app.dependency_overrides[require_api_key] = lambda: {"key_id": "release-test-key", "user_id": "release-test-user"}
    try:
        response = client.post(
            "/api/v3/public/redact",
            json={"text": "Synthetic PAN: ABCDE1234F"},
        )
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(require_api_key, None)
        else:
            app.dependency_overrides[require_api_key] = previous_override

    assert response.status_code == 410
    assert "output verification" in response.json()["detail"]
    assert "redacted_text" not in response.json()


def test_openapi_marks_disabled_release_routes():
    schema = app.openapi()
    disabled_routes = [
        ("/api/v3/documents/{document_id}/redact", "post"),
        ("/api/v3/redact-pdf", "post"),
        ("/api/v3/redact-image", "post"),
        ("/api/v3/redact-image/download", "post"),
        ("/api/v3/public/redact", "post"),
    ]

    for path, method in disabled_routes:
        operation = schema["paths"][path][method]
        assert operation["deprecated"] is True
        assert "410" in operation["responses"]
    assert "415" in schema["paths"]["/api/v3/documents/{document_id}/redact/async"]["post"]["responses"]
    assert "415" in schema["paths"]["/api/v3/documents/upload"]["post"]["responses"]


def test_async_export_rejects_non_pdf_before_creating_job(owned_document):
    document_id, access_token = owned_document
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).one()
        doc.filename = "photo.png"
        doc.file_type = "image/png"
        db.commit()
    finally:
        db.close()

    response = client.post(
        f"/api/v3/documents/{document_id}/redact/async",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 415
    db = SessionLocal()
    try:
        assert db.query(RedactionJob).filter(RedactionJob.document_id == document_id).count() == 0
    finally:
        db.close()


def test_worker_quarantines_legacy_non_pdf_job_before_storage_access(owned_document, monkeypatch):
    from app.services.storage import StorageService

    document_id, _ = owned_document
    job_id = f"release_job_{uuid.uuid4().hex}"
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).one()
        doc.filename = "unknown.bin"
        doc.file_type = "application/octet-stream"
        job = RedactionJob(id=job_id, document_id=document_id, status=JobStatus.QUEUED)
        db.add(job)
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(
        StorageService,
        "get_document",
        lambda *_args, **_kwargs: pytest.fail("legacy jobs must be rejected before reading storage"),
    )
    result = process_redaction(job_id)

    assert result["status"] == "review_required"
    db = SessionLocal()
    try:
        job = db.query(RedactionJob).filter(RedactionJob.id == job_id).one()
        assert job.status == JobStatus.REVIEW_REQUIRED
        assert job.result_storage_key is None
    finally:
        db.close()


@pytest.mark.parametrize("changed_field", ["source", "entities", "policy"])
def test_release_gate_rejects_document_changes_after_job_snapshot(changed_field):
    from types import SimpleNamespace

    entities = [{"entity_type": "EMAIL", "text": "original@example.test"}]
    policy = {"mode": "balanced", "version": "balanced-v1"}
    document = SimpleNamespace(
        storage_key="uploads/source.pdf",
        source_sha256=hashlib.sha256(b"source pdf").hexdigest(),
        detected_entities=entities,
        canonical_representation={"metadata": {"redaction_policy": policy}},
    )
    job = SimpleNamespace(
        source_storage_key=document.storage_key,
        source_sha256=document.source_sha256,
        entities_snapshot=entities,
        entities_sha256=canonical_sha256(entities),
        policy_config=policy,
        policy_sha256=canonical_sha256(policy),
        policy_version=policy["version"],
    )

    if changed_field == "source":
        document.source_sha256 = hashlib.sha256(b"replacement pdf").hexdigest()
        expected_error = "source changed"
    elif changed_field == "entities":
        document.detected_entities = [{"entity_type": "EMAIL", "text": "changed@example.test"}]
        expected_error = "entities changed"
    else:
        document.canonical_representation["metadata"]["redaction_policy"] = {
            "mode": "strict",
            "version": "strict-v1",
        }
        expected_error = "policy changed"

    with pytest.raises(ValueError, match=expected_error):
        assert_document_matches_job_snapshot(job, document)


def test_download_returns_only_bytes_matching_the_verified_artifact_hash(owned_document, monkeypatch):
    from app.core.config import settings
    from app.services.storage import StorageService

    document_id, access_token = owned_document
    artifact_bytes = b"verified PDF artifact bytes"
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).one()
        policy = doc.canonical_representation["metadata"]["redaction_policy"]
        job = RedactionJob(
            id=f"release_job_{uuid.uuid4().hex}",
            document_id=document_id,
            status=JobStatus.COMPLETED,
            policy_config=policy,
            policy_version=policy["version"],
            policy_sha256=canonical_sha256(policy),
            source_storage_key=doc.storage_key,
            source_sha256=doc.source_sha256,
            entities_snapshot=[],
            entities_sha256=canonical_sha256([]),
            result_storage_key="redacted/verified.pdf",
            result_sha256=hashlib.sha256(artifact_bytes).hexdigest(),
        )
        doc.detected_entities = []
        doc.safety_status = SafetyStatus.VERIFIED
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    stored_bytes = [artifact_bytes]
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(StorageService, "get_document", lambda _key: stored_bytes[0])
    monkeypatch.setattr(
        StorageService,
        "generate_presigned_url",
        lambda *_args, **_kwargs: pytest.fail("release must return the bytes whose checksum was checked"),
    )

    headers = {"Authorization": f"Bearer {access_token}"}
    response = client.get(f"/api/v3/documents/redact/jobs/{job_id}/download", headers=headers)
    assert response.status_code == 200
    assert response.content == artifact_bytes

    stored_bytes[0] = b"tampered PDF artifact bytes"
    tampered = client.get(f"/api/v3/documents/redact/jobs/{job_id}/download", headers=headers)
    assert tampered.status_code == 409
    assert "checksum" in tampered.json()["detail"].lower()


def test_queued_job_captures_immutable_source_entities_and_policy(owned_document, monkeypatch):
    from app.api import documents as documents_api

    document_id, access_token = owned_document
    original_entities = [{"entity_type": "EMAIL", "text": "test@example.test", "start": 0, "end": 17}]
    original_policy = {"mode": "balanced", "version": "balanced-v1"}
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).one()
        doc.storage_key = "uploads/release-test.pdf"
        doc.source_sha256 = hashlib.sha256(b"immutable pdf bytes").hexdigest()
        doc.detected_entities = original_entities
        doc.canonical_representation = {"metadata": {"redaction_policy": original_policy}}
        db.commit()
    finally:
        db.close()
    monkeypatch.setattr(documents_api.process_redaction, "delay", lambda _job_id: None)

    response = client.post(
        f"/api/v3/documents/{document_id}/redact/async",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200, response.text
    job_id = response.json()["job_id"]
    db = SessionLocal()
    try:
        job = db.query(RedactionJob).filter(RedactionJob.id == job_id).one()
        doc = db.query(Document).filter(Document.id == document_id).one()
        assert job.source_storage_key == doc.storage_key
        assert job.source_sha256 == doc.source_sha256
        assert job.entities_snapshot == original_entities
        assert job.entities_sha256 == canonical_sha256(original_entities)
        assert job.policy_config == original_policy
        assert job.policy_version == "balanced-v1"
        doc.detected_entities = [{"entity_type": "EMAIL", "text": "changed@example.test", "start": 0, "end": 19}]
        job.status = JobStatus.COMPLETED
        job.result_storage_key = "redacted/release-test.pdf"
        doc.safety_status = SafetyStatus.VERIFIED
        db.commit()
    finally:
        db.close()

    download = client.get(
        f"/api/v3/documents/redact/jobs/{job_id}/download",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert download.status_code == 409
    assert "entities changed" in download.json()["detail"]

    result = process_redaction(job_id)

    assert result["status"] == "review_required"
    db = SessionLocal()
    try:
        job = db.query(RedactionJob).filter(RedactionJob.id == job_id).one()
        doc = db.query(Document).filter(Document.id == document_id).one()
        assert job.status == JobStatus.REVIEW_REQUIRED
        assert job.result_storage_key is None
        assert doc.safety_status == SafetyStatus.VERIFICATION_FAILED
    finally:
        db.close()


def test_redaction_engine_rejects_unknown_format_without_passthrough():
    with pytest.raises(ValueError, match="refusing to return the source bytes"):
        SecureRedactionEngine.redact_document(b"source bytes", "unknown.bin", [])


@pytest.mark.parametrize(
    ("filename", "content_type", "file_bytes", "expected_detail"),
    [
        ("unknown.bin", "application/octet-stream", b"\x00binary data", "Unsupported document format"),
        ("invalid.txt", "text/plain", b"plain text with invalid byte: \xff", "valid UTF-8"),
    ],
)
def test_unsupported_uploads_are_rejected_before_storage(
    owned_document,
    monkeypatch,
    filename,
    content_type,
    file_bytes,
    expected_detail,
):
    from app.services.storage import StorageService

    document_id, access_token = owned_document
    db = SessionLocal()
    try:
        org_id = db.query(Document).filter(Document.id == document_id).one().org_id
    finally:
        db.close()

    monkeypatch.setattr(
        StorageService,
        "save_document",
        lambda *_args, **_kwargs: pytest.fail("unsupported input must be rejected before storage"),
    )
    response = client.post(
        "/api/v3/documents/upload",
        params={"org_id": org_id},
        headers={"Authorization": f"Bearer {access_token}"},
        files={"file": (filename, file_bytes, content_type)},
    )

    assert response.status_code == 415
    assert expected_detail in response.json()["detail"]
