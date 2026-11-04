from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import uuid

import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api.auth import router as auth_router
from app.core.auth_rate_limit import get_auth_rate_limiter
from app.api.org import router as org_router
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.models.document import Document, JobStatus, RedactionJob, SafetyStatus
from app.models.identity import Session, User
from app.services.storage import StorageService
from feature14_audit_report import router as report_router


Base.metadata.create_all(bind=engine)
fastapi_app = FastAPI()
fastapi_app.include_router(auth_router)
fastapi_app.include_router(org_router)
fastapi_app.include_router(report_router)
client = TestClient(fastapi_app)


class NoopAuthRateLimiter:
    def enforce(self, *_args, **_kwargs):
        return None


fastapi_app.dependency_overrides[get_auth_rate_limiter] = lambda: NoopAuthRateLimiter()


def register_user() -> dict:
    suffix = uuid.uuid4().hex
    response = client.post(
        "/api/v3/auth/register",
        json={
            "email": f"report-{suffix}@example.com",
            "password": "report-test-password-long-enough",
            "full_name": "Report Test User",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_verified_job(user_id: str, filename: str, entity_type: str) -> str:
    db = SessionLocal()
    try:
        document_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        document = Document(
            id=document_id,
            org_id=f"org_{user_id}",
            uploaded_by=user_id,
            filename=filename,
            file_type="application/pdf",
            storage_key="uploads/synthetic.pdf",
            status=JobStatus.COMPLETED,
            safety_status=SafetyStatus.VERIFIED,
            detected_entities=[{"entity_type": entity_type, "text": "synthetic"}],
        )
        job = RedactionJob(
            id=job_id,
            document_id=document_id,
            status=JobStatus.COMPLETED,
            result_storage_key=f"redacted/{job_id}.pdf",
            completed_at=datetime.utcnow(),
            policy_config={"mode": "balanced", "version": "balanced-v1"},
        )
        db.add_all([document, job])
        db.commit()
        return job_id
    finally:
        db.close()


def test_report_generation_verification_and_history_require_authentication():
    body = {"report_title": "Synthetic report", "logs": [{"id": "synthetic"}]}
    assert client.post("/api/v3/audit/report", json=body).status_code == 401
    assert client.get("/api/v3/audit/verify/" + "a" * 64).status_code == 401
    assert client.get("/api/v3/audit/report/history").status_code == 401


def test_report_signing_key_is_required(monkeypatch):
    user = register_user()
    monkeypatch.delenv("CIPHERA_REPORT_SIGNING_KEY", raising=False)
    response = client.post(
        "/api/v3/audit/report",
        headers={"Authorization": f"Bearer {user['access_token']}"},
        json={"report_title": "Unsigned report"},
    )
    assert response.status_code == 503


def test_jwt_key_rotation_invalidates_access_and_refresh_sessions(monkeypatch):
    user = register_user()
    monkeypatch.setattr(settings, "SECRET_KEY", SecretStr("rotated-jwt-secret-for-ciphera-tests-0123456789-abcdef"))

    access_response = client.get(
        "/api/v3/auth/me",
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )
    assert access_response.status_code == 401

    refresh_response = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": user["refresh_token"]},
    )
    assert refresh_response.status_code == 401

    db = SessionLocal()
    try:
        assert db.query(Session).filter(Session.user_id == user["user_id"]).count() == 0
    finally:
        db.close()


def test_access_tokens_require_purpose_issuer_audience_active_user_and_session():
    user = register_user()
    token = user["access_token"]
    claims = jwt.decode(
        token,
        settings.jwt_signing_secret,
        algorithms=[settings.ALGORITHM],
        issuer=settings.JWT_ISSUER,
        audience=settings.JWT_AUDIENCE,
    )
    assert claims["type"] == "access"
    assert claims["sid"]
    assert claims["iss"] == settings.JWT_ISSUER
    assert claims["aud"] == settings.JWT_AUDIENCE
    assert int(claims["exp"] - claims["iat"]) == 15 * 60
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v3/auth/me", headers=headers).status_code == 200

    wrong_purpose = {**claims, "type": "org_invite"}
    wrong_purpose_token = jwt.encode(wrong_purpose, settings.jwt_signing_secret, algorithm=settings.ALGORITHM)
    assert client.get(
        "/api/v3/auth/me", headers={"Authorization": f"Bearer {wrong_purpose_token}"}
    ).status_code == 401

    wrong_audience = {**claims, "aud": settings.ORG_INVITE_AUDIENCE}
    wrong_audience_token = jwt.encode(wrong_audience, settings.jwt_signing_secret, algorithm=settings.ALGORITHM)
    assert client.get(
        "/api/v3/auth/me", headers={"Authorization": f"Bearer {wrong_audience_token}"}
    ).status_code == 401

    wrong_issuer = {**claims, "iss": "another-application"}
    wrong_issuer_token = jwt.encode(wrong_issuer, settings.jwt_signing_secret, algorithm=settings.ALGORITHM)
    assert client.get(
        "/api/v3/auth/me", headers={"Authorization": f"Bearer {wrong_issuer_token}"}
    ).status_code == 401

    db = SessionLocal()
    try:
        db.query(User).filter(User.id == user["user_id"]).update({"is_active": False})
        db.commit()
    finally:
        db.close()
    assert client.get("/api/v3/auth/me", headers=headers).status_code == 401


def test_org_invites_use_a_separate_jwt_audience_and_type():
    user = register_user()
    headers = {"Authorization": f"Bearer {user['access_token']}"}
    org_id = f"org_{user['user_id']}"
    invitation = client.post(
        f"/api/v3/org/{org_id}/invite",
        headers=headers,
        json={"email": "invite-target@example.com", "role": "member"},
    )
    assert invitation.status_code == 200, invitation.text
    invite_token = invitation.json()["token"]
    invite_claims = jwt.decode(
        invite_token,
        settings.jwt_signing_secret,
        algorithms=[settings.ALGORITHM],
        issuer=settings.JWT_ISSUER,
        audience=settings.ORG_INVITE_AUDIENCE,
    )
    assert invite_claims["type"] == "org_invite"

    misuse = client.post(
        "/api/v3/org/accept-invite",
        headers=headers,
        json={"token": user["access_token"]},
    )
    assert misuse.status_code == 400

    logout = client.post("/api/v3/auth/logout", json={"refresh_token": user["refresh_token"]})
    assert logout.status_code == 200
    db = SessionLocal()
    try:
        assert db.query(Session).filter(Session.user_id == user["user_id"]).count() == 0
    finally:
        db.close()
    assert client.get("/api/v3/auth/me", headers=headers).status_code == 401


def test_reports_use_verified_server_jobs_and_bind_their_artifact_bytes(monkeypatch):
    requests = []

    class ProbeHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"synthetic response")

        def log_message(self, _format, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), ProbeHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    payload = f'<img src="http://127.0.0.1:{server.server_port}/should-not-be-fetched" width="1" height="1"/>'
    artifact_bytes = b"synthetic verified redacted PDF bytes"
    monkeypatch.setattr(StorageService, "get_document", classmethod(lambda _cls, _key: artifact_bytes))

    try:
        alice = register_user()
        bob = register_user()
        headers = {"Authorization": f"Bearer {alice['access_token']}"}
        spoofed = client.post(
            "/api/v3/audit/report",
            headers=headers,
            json={
                "session_id": bob["user_id"],
                "report_title": payload,
                "logs": [{"id": "client-forged", "status": "Completed", "entities_discovered": 900}],
            },
        )
        assert spoofed.status_code == 404

        job_id = create_verified_job(alice["user_id"], payload, payload)
        report = client.post(
            "/api/v3/audit/report",
            headers=headers,
            json={
                "session_id": bob["user_id"],
                "report_title": payload,
                "include_raw_log": True,
                "logs": [{"id": "client-forged", "status": "Completed", "entities_discovered": 900}],
            },
        )
        assert report.status_code == 200, report.text
        assert report.content.startswith(b"%PDF")
        assert report.headers.get("X-Ciphera-Signature")
        assert requests == []

        report_hash = report.headers["X-Ciphera-Content-Hash"]
        verify_as_alice = client.get(
            f"/api/v3/audit/verify/{report_hash}", headers=headers
        )
        assert verify_as_alice.status_code == 200, verify_as_alice.text
        assert verify_as_alice.json()["verified"] is True
        assert verify_as_alice.json()["document_count"] == 1

        verify_as_bob = client.get(
            f"/api/v3/audit/verify/{report_hash}",
            headers={"Authorization": f"Bearer {bob['access_token']}"},
        )
        assert verify_as_bob.status_code == 404

        monkeypatch.setattr(StorageService, "get_document", classmethod(lambda _cls, _key: b"altered artifact bytes"))
        changed_artifact = client.get(f"/api/v3/audit/verify/{report_hash}", headers=headers)
        assert changed_artifact.status_code == 409

        history_as_bob = client.get(
            f"/api/v3/audit/report/history?session_id={alice['user_id']}",
            headers={"Authorization": f"Bearer {bob['access_token']}"},
        )
        assert history_as_bob.status_code == 200
        assert history_as_bob.json()["reports"] == []
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_concurrent_reports_share_one_hash_chain(monkeypatch):
    artifact_bytes = b"synthetic verified redacted PDF bytes"
    monkeypatch.setattr(StorageService, "get_document", classmethod(lambda _cls, _key: artifact_bytes))
    user = register_user()
    create_verified_job(user["user_id"], "chain-test.pdf", "PAN_NUMBER")
    headers = {"Authorization": f"Bearer {user['access_token']}"}

    def generate():
        with TestClient(fastapi_app) as concurrent_client:
            return concurrent_client.post(
                "/api/v3/audit/report",
                headers=headers,
                json={"report_title": "Concurrent chain report"},
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _index: generate(), range(2)))
    assert all(response.status_code == 200 for response in responses), [response.text for response in responses]

    history = client.get("/api/v3/audit/report/history", headers=headers)
    assert history.status_code == 200, history.text
    reports = history.json()["reports"]
    assert [report["chain_order"] for report in reports] == [2, 1]
    assert reports[0]["prev_hash"] == reports[1]["content_hash"]
