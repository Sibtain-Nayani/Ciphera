import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.auth import router as auth_router
from app.core.database import Base, engine
from feature10_audit_db import router as audit_router


Base.metadata.create_all(bind=engine)
fastapi_app = FastAPI()
fastapi_app.include_router(auth_router)
fastapi_app.include_router(audit_router)
client = TestClient(fastapi_app)


def register_user() -> dict:
    suffix = uuid.uuid4().hex
    response = client.post(
        "/api/v3/auth/register",
        json={
            "email": f"audit-{suffix}@example.com",
            "password": "audit-test-password-long-enough",
            "full_name": "Audit Test User",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def post_log(token: str, client_id: str) -> dict:
    response = client.post(
        "/api/v3/audit/log",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "id": client_id,
            "name": "Synthetic test document",
            "size": "1 KB",
            "date": "client timestamp is not used for authorization",
            "status": "Completed",
            "entities_discovered": 1,
            "rules_applied": ["EMAIL"],
            "session_id": "attacker-selected-session",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_audit_routes_require_authentication_for_reads_and_mutations():
    anonymous_get = client.get("/api/v3/audit/logs")
    anonymous_stats = client.get("/api/v3/audit/stats")
    anonymous_metrics = client.get("/api/v3/audit/metrics")
    anonymous_post = client.post(
        "/api/v3/audit/log",
        json={"name": "forged", "date": "today"},
    )
    anonymous_delete = client.delete("/api/v3/audit/does-not-exist")
    anonymous_clear = client.delete("/api/v3/audit/clear/all")

    assert anonymous_get.status_code == 401
    assert anonymous_stats.status_code == 401
    assert anonymous_metrics.status_code == 401
    assert anonymous_post.status_code == 401
    assert anonymous_delete.status_code == 401
    assert anonymous_clear.status_code == 401


def test_server_ids_and_user_scoping_prevent_cross_tenant_replacement_or_deletion():
    alice = register_user()
    bob = register_user()

    alice_log = post_log(alice["access_token"], "attacker-chosen-shared-id")
    bob_log = post_log(bob["access_token"], "attacker-chosen-shared-id")
    assert alice_log["id"] != bob_log["id"]

    # Supplying another user's session ID does not change the authenticated scope.
    bob_logs = client.get(
        f"/api/v3/audit/logs?session_id={alice['user_id']}",
        headers={"Authorization": f"Bearer {bob['access_token']}"},
    )
    assert bob_logs.status_code == 200
    assert [row["id"] for row in bob_logs.json()["logs"]] == [bob_log["id"]]

    cross_delete = client.delete(
        f"/api/v3/audit/{alice_log['id']}",
        headers={"Authorization": f"Bearer {bob['access_token']}"},
    )
    assert cross_delete.status_code == 404

    alice_logs = client.get(
        "/api/v3/audit/logs",
        headers={"Authorization": f"Bearer {alice['access_token']}"},
    )
    assert [row["id"] for row in alice_logs.json()["logs"]] == [alice_log["id"]]


def test_clear_all_ignores_other_users_session_id():
    alice = register_user()
    bob = register_user()
    alice_log = post_log(alice["access_token"], "alice-client-id")
    bob_log = post_log(bob["access_token"], "bob-client-id")

    clear = client.delete(
        f"/api/v3/audit/clear/all?session_id={alice['user_id']}",
        headers={"Authorization": f"Bearer {bob['access_token']}"},
    )
    assert clear.status_code == 200
    assert clear.json()["session_id"] == bob["user_id"]

    alice_logs = client.get(
        "/api/v3/audit/logs",
        headers={"Authorization": f"Bearer {alice['access_token']}"},
    )
    bob_logs = client.get(
        "/api/v3/audit/logs",
        headers={"Authorization": f"Bearer {bob['access_token']}"},
    )
    assert [row["id"] for row in alice_logs.json()["logs"]] == [alice_log["id"]]
    assert bob_logs.json()["logs"] == []
    assert bob_log["id"] not in [row["id"] for row in alice_logs.json()["logs"]]
