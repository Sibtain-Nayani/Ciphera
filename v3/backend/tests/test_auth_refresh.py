import uuid
import hashlib
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.auth import router as auth_router
from app.core.auth_rate_limit import AuthRateLimiter, get_auth_rate_limiter
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.models.identity import RefreshToken, Session, User
from app.schemas.auth import LoginRequest, UserCreate
from pydantic import ValidationError
from feature8_api_keys import api_router as api_key_router
from feature17_social_auth import _create_session_for_user
from feature18_webhooks import router as webhook_router


Base.metadata.create_all(bind=engine)
fastapi_app = FastAPI()
fastapi_app.include_router(auth_router)
fastapi_app.include_router(api_key_router)
fastapi_app.include_router(webhook_router)
client = TestClient(fastapi_app)


class FakeRedis:
    def __init__(self):
        self.counts: dict[str, int] = {}
        self.lock = Lock()

    def eval(self, script: str, key_count: int, key: str, window_seconds: int) -> int:
        with self.lock:
            self.counts[key] = self.counts.get(key, 0) + 1
            return self.counts[key]


fake_redis = FakeRedis()
fastapi_app.dependency_overrides[get_auth_rate_limiter] = lambda: AuthRateLimiter(fake_redis)


def register_user() -> dict:
    response = client.post(
        "/api/v3/auth/register",
        json={
            "email": f"refresh-{uuid.uuid4().hex}@example.com",
            "password": "long-enough-refresh-password",
            "full_name": "Refresh Test User",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_refresh_rotates_once_and_replay_revokes_session_family():
    original = register_user()

    rotated = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": original["refresh_token"]},
    )
    assert rotated.status_code == 200, rotated.text
    current = rotated.json()
    assert current["refresh_token"] != original["refresh_token"]

    replay = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": original["refresh_token"]},
    )
    assert replay.status_code == 401
    assert replay.json()["detail"] == "Refresh token reuse detected"

    # Reuse revokes the session that issued the rotated token, invalidating its
    # access token and refresh token as a family.
    assert client.get(
        "/api/v3/auth/me",
        headers={"Authorization": f"Bearer {current['access_token']}"},
    ).status_code == 401
    assert client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": current["refresh_token"]},
    ).status_code == 401


def test_unknown_refresh_token_does_not_revoke_a_live_session():
    credentials = register_user()

    invalid = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": "0" * 64},
    )
    assert invalid.status_code == 401

    still_valid = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": credentials["refresh_token"]},
    )
    assert still_valid.status_code == 200, still_valid.text


def test_refresh_history_tracks_current_and_consumed_credentials():
    credentials = register_user()
    rotated = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": credentials["refresh_token"]},
    )
    assert rotated.status_code == 200, rotated.text

    db = SessionLocal()
    try:
        records = db.query(RefreshToken).join(Session).filter(
            Session.user_id == credentials["user_id"]
        ).all()
        assert len(records) == 2
        assert sum(record.consumed_at is not None for record in records) == 1
        assert sum(record.consumed_at is None for record in records) == 1
    finally:
        db.close()


def test_google_oauth_sessions_register_refresh_credentials_for_rotation():
    account = register_user()
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(id=account["user_id"]).one()
        _access_token, oauth_refresh = _create_session_for_user(user)
    finally:
        db.close()

    response = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": oauth_refresh},
    )
    assert response.status_code == 200, response.text


def test_api_key_and_webhook_routes_require_live_v3_sessions():
    credentials = register_user()
    protected_routes = ("/api/v3/keys/list", "/api/v3/webhooks/list")

    for path in protected_routes:
        assert client.get(path).status_code == 401
        authorized = client.get(
            path,
            headers={"Authorization": f"Bearer {credentials['access_token']}"},
        )
        assert authorized.status_code == 200, authorized.text

    assert client.post(
        "/api/v3/auth/logout",
        json={"refresh_token": credentials["refresh_token"]},
    ).status_code == 200

    for path in protected_routes:
        revoked = client.get(
            path,
            headers={"Authorization": f"Bearer {credentials['access_token']}"},
        )
        assert revoked.status_code == 401


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL row-lock semantics")
def test_concurrent_refresh_is_serialized_and_replay_revokes_session_family():
    credentials = register_user()

    def refresh_once():
        return TestClient(fastapi_app).post(
            "/api/v3/auth/refresh",
            json={"refresh_token": credentials["refresh_token"]},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _index: refresh_once(), range(2)))

    assert sorted(response.status_code for response in responses) == [200, 401]
    successful = next(response.json() for response in responses if response.status_code == 200)
    assert client.get(
        "/api/v3/auth/me",
        headers={"Authorization": f"Bearer {successful['access_token']}"},
    ).status_code == 401


def test_passwords_are_bounded_by_bcrypt_utf8_byte_limit():
    assert UserCreate(
        email="utf8@example.com",
        password="é" * 36,  # 72 UTF-8 bytes
        full_name="UTF8 User",
    )
    with pytest.raises(ValidationError):
        UserCreate(
            email="too-long@example.com",
            password="é" * 37,  # 74 UTF-8 bytes
            full_name="Too Long",
        )
    with pytest.raises(ValidationError):
        LoginRequest(email="too-long@example.com", password="é" * 37)


def test_login_enforces_account_limit_before_password_verification():
    credentials = register_user()
    email = credentials["user"]["email"]

    for _ in range(settings.AUTH_LOGIN_ACCOUNT_LIMIT):
        response = client.post(
            "/api/v3/auth/login",
            json={"email": email, "password": "incorrect-password"},
        )
        assert response.status_code == 401

    limited = client.post(
        "/api/v3/auth/login",
        json={"email": email, "password": "incorrect-password"},
    )
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == str(settings.AUTH_LOGIN_WINDOW_SECONDS)


def test_refresh_enforces_account_limit_without_consuming_the_token():
    credentials = register_user()
    account_hash = hashlib.sha256(credentials["user_id"].encode("utf-8")).hexdigest()
    bucket = f"ciphera:auth-rate:refresh-account:{account_hash}"
    fake_redis.counts[bucket] = settings.AUTH_REFRESH_ACCOUNT_LIMIT

    limited = client.post(
        "/api/v3/auth/refresh",
        json={"refresh_token": credentials["refresh_token"]},
    )
    assert limited.status_code == 429

    token_hash = hashlib.sha256(credentials["refresh_token"].encode("utf-8")).hexdigest()
    db = SessionLocal()
    try:
        record = db.query(RefreshToken).filter_by(token_hash=token_hash).one()
        assert record.consumed_at is None
    finally:
        db.close()


def test_rate_limit_redis_failure_fails_closed():
    from redis.exceptions import ConnectionError as RedisConnectionError

    class UnavailableRedis:
        def eval(self, *_args):
            raise RedisConnectionError("test outage")

    fastapi_app.dependency_overrides[get_auth_rate_limiter] = lambda: AuthRateLimiter(UnavailableRedis())
    try:
        limited = client.post(
            "/api/v3/auth/login",
            json={"email": "unavailable@example.com", "password": "incorrect-password"},
        )
        assert limited.status_code == 503
        assert limited.headers["retry-after"] == "5"
    finally:
        fastapi_app.dependency_overrides[get_auth_rate_limiter] = lambda: AuthRateLimiter(fake_redis)


def test_refresh_history_migration_backfills_existing_live_sessions():
    backend_dir = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="ciphera-refresh-migration-") as temp_dir:
        database_path = Path(temp_dir) / "migration.db"
        database_url = f"sqlite:///{database_path.as_posix()}"
        env = os.environ.copy()
        env["DATABASE_URL"] = database_url

        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "b7c184d2f0a6"],
            cwd=backend_dir,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

        migration_engine = create_engine(database_url)
        MigrationSession = sessionmaker(bind=migration_engine)
        legacy_hash = "a" * 64
        db = MigrationSession()
        try:
            user_id = str(uuid.uuid4())
            db.add(User(
                id=user_id,
                email=f"migration-{uuid.uuid4().hex}@example.com",
                password_hash="legacy-hash",
                full_name="Migration User",
            ))
            db.add(Session(
                id=str(uuid.uuid4()),
                user_id=user_id,
                refresh_token_hash=legacy_hash,
                signing_key_version=settings.auth_key_version,
                expires_at=datetime.utcnow() + timedelta(days=1),
            ))
            db.commit()
        finally:
            db.close()

        migration = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=backend_dir,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )
        assert migration.returncode == 0, migration.stderr

        db = MigrationSession()
        try:
            migrated = db.query(RefreshToken).filter_by(token_hash=legacy_hash).one()
            assert migrated.consumed_at is None
            assert migrated.expires_at is not None
        finally:
            db.close()
            migration_engine.dispose()
