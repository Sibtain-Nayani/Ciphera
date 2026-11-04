"""Keep account-owned mounted routes behind the canonical live-session check."""

from fastapi.routing import APIRoute

from app.api.auth import get_current_user
from main import app


def _dependency_calls(dependant):
    for child in dependant.dependencies:
        if child.call is not None:
            yield child.call
        yield from _dependency_calls(child)


def test_account_owned_mounted_routes_use_canonical_session_auth():
    expected_protected_routes = {
        ("GET", "/api/v3/auth/me"),
        ("POST", "/api/v3/org/create"),
        ("GET", "/api/v3/org/me"),
        ("GET", "/api/v3/org/{org_id}/members"),
        ("POST", "/api/v3/org/{org_id}/invite"),
        ("POST", "/api/v3/org/accept-invite"),
        ("POST", "/api/v3/documents/upload"),
        ("GET", "/api/v3/documents/{document_id}/canonical"),
        ("GET", "/api/v3/documents/{document_id}/entities"),
        ("POST", "/api/v3/documents/{document_id}/redact"),
        ("PUT", "/api/v3/documents/{document_id}/entities"),
        ("POST", "/api/v3/documents/{document_id}/redact/async"),
        ("GET", "/api/v3/documents/redact/jobs/{job_id}"),
        ("GET", "/api/v3/documents/redact/jobs/{job_id}/download"),
        ("POST", "/api/v3/keys/create"),
        ("GET", "/api/v3/keys/list"),
        ("DELETE", "/api/v3/keys/{key_id}"),
        ("GET", "/api/v3/keys/{key_id}/usage"),
        ("POST", "/api/v3/audit/log"),
        ("GET", "/api/v3/audit/logs"),
        ("GET", "/api/v3/audit/stats"),
        ("GET", "/api/v3/audit/metrics"),
        ("DELETE", "/api/v3/audit/{run_id}"),
        ("DELETE", "/api/v3/audit/clear/all"),
        ("POST", "/api/v3/audit/report"),
        ("GET", "/api/v3/audit/verify/{content_hash}"),
        ("GET", "/api/v3/audit/report/history"),
        ("POST", "/api/v3/webhooks/register"),
        ("GET", "/api/v3/webhooks/list"),
        ("DELETE", "/api/v3/webhooks/{webhook_id}"),
        ("GET", "/api/v3/webhooks/{webhook_id}/deliveries"),
        ("POST", "/api/v3/webhooks/{webhook_id}/test"),
    }

    mounted = {
        (method, route.path): route
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    }
    missing = expected_protected_routes - mounted.keys()
    assert not missing, f"Expected account routes are not mounted: {sorted(missing)}"

    unauthenticated = [
        route_key
        for route_key in expected_protected_routes
        if get_current_user not in tuple(_dependency_calls(mounted[route_key].dependant))
    ]
    assert not unauthenticated, (
        "Account-owned routes must validate an active v3 user session: "
        f"{sorted(unauthenticated)}"
    )
