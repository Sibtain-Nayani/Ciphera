"""Keep file-backed audit DBs isolated from developer and application data."""

import os
import tempfile


_audit_db = tempfile.NamedTemporaryFile(prefix="ciphera-audit-tests-", suffix=".db", delete=False)
_audit_db.close()
os.environ["CIPHERA_AUDIT_DB_PATH"] = _audit_db.name
os.environ.setdefault(
    "CIPHERA_LEGACY_AUTH_DB_PATH",
    os.path.join(tempfile.gettempdir(), f"ciphera-legacy-auth-tests-{os.getpid()}.db"),
)
os.environ.setdefault(
    "CIPHERA_DB_PATH",
    os.path.join(tempfile.gettempdir(), f"ciphera-webhook-tests-{os.getpid()}.db"),
)
os.environ["CIPHERA_JWT_SECRET"] = "test-jwt-secret-for-ciphera-tests-0123456789-abcdef"
os.environ.setdefault("CIPHERA_REPORT_SIGNING_KEY", "test-report-signing-key-0123456789abcdef")
