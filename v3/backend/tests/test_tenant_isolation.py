import uuid
import hashlib
import secrets
from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.auth import create_access_token, router as auth_router
from app.api.documents import router as documents_router
from app.core.database import Base, SessionLocal, engine
from app.core.config import settings
from app.models.document import Document
from app.models.identity import (
    GlobalRole,
    Organization,
    OrganizationMember,
    OrgRole,
    Session,
    User,
)
from app.services.detection_engine import DetectionEngine
from app.services.storage import StorageService


Base.metadata.create_all(bind=engine)
fastapi_app = FastAPI()
fastapi_app.include_router(auth_router)
fastapi_app.include_router(documents_router)
client = TestClient(fastapi_app)


def register_user() -> tuple[dict, str]:
    suffix = uuid.uuid4().hex
    response = client.post(
        "/api/v3/auth/register",
        json={
            "email": f"tenant-{suffix}@example.com",
            "password": "test-password-with-enough-length",
            "full_name": "Tenant Test User",
        },
    )
    assert response.status_code == 200, response.text
    return response.json(), suffix


def access_token_for_existing_user(user_id: str, email: str, org_id: str, role: str) -> str:
    refresh_token_hash = hashlib.sha256(secrets.token_hex(32).encode()).hexdigest()
    db = SessionLocal()
    try:
        session = Session(
            user_id=user_id,
            refresh_token_hash=refresh_token_hash,
            signing_key_version=settings.auth_key_version,
            expires_at=datetime.utcnow() + timedelta(days=1),
        )
        db.add(session)
        db.flush()
        token = create_access_token(user_id, email, org_id, role, session_id=session.id)
        db.commit()
        return token
    finally:
        db.close()


def test_registration_gives_users_different_private_organizations():
    first, _ = register_user()
    second, _ = register_user()

    db = SessionLocal()
    try:
        first_orgs = {
            membership.org_id
            for membership in db.query(OrganizationMember)
            .filter_by(user_id=first["user_id"])
            .all()
        }
        second_orgs = {
            membership.org_id
            for membership in db.query(OrganizationMember)
            .filter_by(user_id=second["user_id"])
            .all()
        }
    finally:
        db.close()

    assert first_orgs == {f"org_{first['user_id']}"}
    assert second_orgs == {f"org_{second['user_id']}"}
    assert first_orgs.isdisjoint(second_orgs)


@pytest.mark.parametrize("query", ["", "?org_id=default-org"])
def test_upload_uses_users_private_organization(monkeypatch, query):
    registration, _ = register_user()

    monkeypatch.setattr(DetectionEngine, "run_detection", staticmethod(lambda _doc: []))
    monkeypatch.setattr(
        StorageService,
        "save_document",
        classmethod(lambda _cls, _file, _name, directory="documents": f"{directory}/test.txt"),
    )

    response = client.post(
        f"/api/v3/documents/upload{query}",
        headers={"Authorization": f"Bearer {registration['access_token']}"},
        files={"file": ("sample.txt", b"Synthetic test document", "text/plain")},
    )
    assert response.status_code == 200, response.text

    db = SessionLocal()
    try:
        document = db.query(Document).filter_by(id=response.json()["document_id"]).one()
        assert document.org_id == f"org_{registration['user_id']}"
    finally:
        db.close()


def test_legacy_shared_org_documents_are_not_visible_to_regular_members():
    suffix = uuid.uuid4().hex[:12]
    alice_id = f"legacy-alice-{suffix}"
    bob_id = f"legacy-bob-{suffix}"
    doc_id = f"legacy-doc-{suffix}"
    alice = User(
        id=alice_id,
        email=f"alice-{suffix}@example.com",
        full_name="Legacy Alice",
        password_hash="not-used",
        global_role=GlobalRole.USER,
    )
    bob = User(
        id=bob_id,
        email=f"bob-{suffix}@example.com",
        full_name="Legacy Bob",
        password_hash="not-used",
        global_role=GlobalRole.USER,
    )
    db = SessionLocal()
    try:
        if not db.query(Organization).filter_by(id="default-org").first():
            db.add(Organization(id="default-org", name="Legacy shared default"))
            db.flush()
        db.add_all([alice, bob])
        db.flush()
        db.add_all(
            [
                OrganizationMember(
                    org_id="default-org", user_id=alice_id, role=OrgRole.MEMBER
                ),
                OrganizationMember(
                    org_id="default-org", user_id=bob_id, role=OrgRole.MEMBER
                ),
                Document(
                    id=doc_id,
                    org_id="default-org",
                    uploaded_by=alice_id,
                    filename="synthetic.txt",
                    file_type="text/plain",
                    storage_key="uploads/synthetic.txt",
                    canonical_representation={"full_text": "synthetic"},
                    detected_entities=[],
                ),
            ]
        )
        db.commit()
    finally:
        db.close()

    bob_token = access_token_for_existing_user(
        bob_id, f"bob-{suffix}@example.com", "default-org", "user"
    )
    response = client.get(
        f"/api/v3/documents/{doc_id}/canonical",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert response.status_code == 404


def test_removed_member_cannot_read_document_even_if_they_uploaded_it():
    suffix = uuid.uuid4().hex[:12]
    user_id = f"former-member-{suffix}"
    org_id = f"former-org-{suffix}"
    doc_id = f"former-doc-{suffix}"
    email = f"former-{suffix}@example.com"
    db = SessionLocal()
    try:
        user = User(
            id=user_id,
            email=email,
            full_name="Former Member",
            password_hash="not-used",
            global_role=GlobalRole.USER,
        )
        org = Organization(id=org_id, name="Temporary Team", created_by=user_id)
        db.add_all([user, org])
        db.flush()
        db.add(OrganizationMember(org_id=org_id, user_id=user_id, role=OrgRole.MEMBER))
        db.add(
            Document(
                id=doc_id,
                org_id=org_id,
                uploaded_by=user_id,
                filename="synthetic.txt",
                file_type="text/plain",
                storage_key="uploads/former.txt",
                canonical_representation={"full_text": "synthetic"},
                detected_entities=[],
            )
        )
        db.commit()
        db.query(OrganizationMember).filter_by(org_id=org_id, user_id=user_id).delete()
        db.commit()
    finally:
        db.close()

    token = access_token_for_existing_user(user_id, email, org_id, "user")
    response = client.get(
        f"/api/v3/documents/{doc_id}/canonical",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404
