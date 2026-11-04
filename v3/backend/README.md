# Backend development guide

The backend is the v3 FastAPI application and Celery worker. Its supported application entry point is `main.py`; run commands from `v3/backend` unless a command says otherwise.

## Requirements

- Python 3.11 (matches `Dockerfile`)
- The pinned packages in `requirements.txt`
- Redis for asynchronous redaction jobs and shared authentication rate limits
- Tesseract OCR with English and Hindi data for OCR features
- spaCy models used by the selected pipeline
- PostgreSQL for shared development/staging, or a disposable SQLite database for isolated local work

The full dependency set includes native NLP, OCR, and image-processing packages. Use a clean virtual environment and install on a supported operating system; partial dependency bundles are not sufficient for the full test suite.

### Windows Python runtime

Use standard 64-bit **CPython 3.11** (for example, the python.org installer) and the Windows Python Launcher. In this checkout, `python.exe` resolves to a WindowsApps execution alias that cannot start; the available MSYS Python 3.12 uses MinGW wheel tags and is not a compatible substitute for the backend's Windows CPython dependencies. Confirm the interpreter before creating a virtual environment:

```powershell
py -0p
py -3.11 --version
```

From `v3/backend`, create and populate the project environment:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m spacy download en_core_web_lg
python -m spacy download xx_ent_wiki_sm
```

If PowerShell still selects the WindowsApps alias, install CPython 3.11 with the launcher and PATH options enabled, then turn off the `python.exe`/`python3.exe` App Installer aliases in **Settings → Apps → Advanced app settings → App execution aliases**. Restart the terminal and confirm `python --version` reports 3.11 before continuing.

## Local setup

```bash
cd v3/backend
python -m venv .venv
# Activate .venv using the command for your shell.
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env`. Replace the JWT and report-signing placeholders with independent random values; the JWT placeholder is intentionally invalid. Do not commit `.env`.

For an isolated local SQLite database, use a disposable path, for example:

```text
DATABASE_URL=sqlite:///./data/ciphera-dev.db
```

Ensure the selected parent directory exists. Apply migrations, then start the API:

```bash
python -m alembic upgrade head
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Start a Redis instance and a separate worker terminal for async redaction:

```bash
python -m celery -A app.core.celery_app:celery worker --loglevel=INFO
```

The API uses `AUTH_RATE_LIMIT_REDIS_URL` for atomic login and refresh limits. Defaults are 20 login attempts per IP and 8 per account per 15 minutes, plus 120 refresh attempts per IP and 30 per account per 5 minutes. If Redis is unavailable, login and refresh fail closed with `503`; keep this Redis service private and monitor its availability. Local development defaults to the Redis broker URL, while Compose points the limiter at Redis database 1.

The API provides generated OpenAPI JSON at `/openapi.json` and Swagger UI at `/docs`. The lightweight `GET /api/v3/health` route reports process/pipeline state; it does not yet prove database, broker, or worker readiness.

## Important routes

| Prefix/path | Responsibility |
|---|---|
| `/api/v3/auth/*` | Password registration/login, refresh/logout, current user; Google OAuth routes are mounted separately |
| `/api/v3/org/*` | Organizations, membership, and invite operations |
| `/api/v3/documents/*` | Upload/parse, entity review, queue redaction, job status, verified artifact download |
| `/api/v3/analyze` | Text analysis route mounted directly in `main.py` |
| `/api/v3/audit/*` | Audit API and signed report API |
| `/api/v3/keys/*`, `/api/v3/public/*` | Session-protected API-key management and API-key-protected processing; persistence remains SQLite pending consolidation |
| `/api/v3/webhooks/*` | Session-protected webhook configuration/delivery; SQLite persistence, destination validation, and durable delivery remain under remediation |

Use the generated OpenAPI specification for exact schemas and status codes. The Android guide documents a narrow client workflow and is not a substitute for OpenAPI.

`POST /api/v3/documents/{document_id}/redact`, `POST /api/v3/redact-pdf`, direct image artifact routes, and `POST /api/v3/public/redact` are deprecated and return `410 Gone`. `POST /api/v3/detect-faces` returns face coordinates only; the UI submits these as entities for asynchronous document redaction. The async artifact workflow currently accepts only files with `.pdf` and `application/pdf`; other types receive `415` and legacy unsupported jobs are quarantined before storage access. Each job snapshots its source, reviewed entities, and versioned policy; the worker records a checksum only after independent PDF verification. Downloads recheck the current document snapshot and the stored artifact checksum. For PDFs, use `POST /api/v3/documents/{document_id}/redact/async`, poll the job, and download only through the verified job download route. API-key `POST /api/v3/public/analyze` remains an analysis-only route.

### Authentication boundary

Account-owned auth, organization, document, key-management, audit/report, and webhook routes require the canonical v3 active-user/session dependency. API-key redaction and analysis endpoints require `X-API-Key`; only the public health endpoint is unauthenticated within that route group. The synchronous analyze, PDF/image, scoring, synthesis, classification, language, and OCR utilities are currently guest-accessible and do not read another user's stored records. They accept untrusted text or files, so their production exposure depends on the upload, CPU, timeout, and rate bounds tracked under S13. Decide explicitly whether guest processing stays enabled before public launch.

## Database and migrations

The SQLAlchemy `Base` is defined in `app/core/database.py`; models are in `app/models/`; Alembic revisions live in `alembic/versions/`. `DATABASE_URL` configures this primary ORM path. The default is SQLite; the local Compose stack overrides it with its own PostgreSQL container.

```bash
# Current revision
python -m alembic current

# Apply pending revisions
python -m alembic upgrade head

# Show revision history
python -m alembic history
```

Never validate a migration against a production or working developer database. Use a fresh disposable SQLite file or an isolated PostgreSQL test database. Do not edit or squash an already deployed revision; add a forward migration and test both upgrade and downgrade behavior where downgrade is safe.

**PostgreSQL/Supabase status:** SQLAlchemy can connect to PostgreSQL, but the application has not completed a Supabase migration. Audit/report, API-key, webhook, and legacy auth paths still contain direct SQLite access. Do not point production at Supabase until those are consolidated, data is migrated with a reviewed ownership map, and tenant isolation/RLS tests pass.

## Storage, queue, and external integrations

- `StorageService` uses local disk by default and an S3-compatible API when `STORAGE_BACKEND=s3`.
- Celery messages carry job identifiers; the worker loads the job and document metadata from the database and accesses bytes through `StorageService`.
- Google OAuth is optional and makes requests to Google.
- Groq scoring is optional and sends submitted text/entity content to the configured provider. Do not enable for sensitive production data without explicit product and privacy approval.
- Webhooks make outbound HTTP requests. Destination validation, tenant/store consolidation, durable scheduling, and SSRF protections remain roadmap work.

## Tests

From `v3/backend`, with the complete dependency set and isolated test database configured:

```bash
python -m pytest tests -q
```

For an isolated run, point the SQLAlchemy and audit stores at disposable files before starting pytest. A Docker image built from `Dockerfile` is also a usable Python 3.11 fallback when the local Windows interpreter is unavailable; mount this backend directory into `/app` and keep test databases inside the container's `/tmp`.

From the repository root, this runs the focused security/tenant suite against disposable container-local SQLite files:

```powershell
# Build once if the image is not already available (includes NLP model downloads).
docker build -t v3-backend:latest ./v3/backend

$backendPath = (Resolve-Path "v3/backend").Path.Replace("\", "/")
docker run --rm -v "$($backendPath):/app" -w /app `
  -e DATABASE_URL=sqlite:////tmp/ciphera-test.db `
  -e CIPHERA_AUDIT_DB_PATH=/tmp/ciphera-audit-test.db `
  v3-backend:latest python -m pytest `
  tests/test_api_security.py tests/test_config_security.py `
  tests/test_auth_refresh.py `
  tests/test_auth_route_contract.py `
  tests/test_audit_isolation.py tests/test_tenant_isolation.py `
  tests/test_default_org_migration.py tests/test_report_security.py -q
```

The checked-in Dockerfile targets Python 3.11. The command above passes 31 tests and skips the PostgreSQL-only concurrency case on SQLite. The authentication module separately passed 11 tests against a disposable PostgreSQL 15 database, including simultaneous refresh, live-session checks on API-key/webhook routes, and migration backfill. The frontend `npm run test:auth` command passes six tests for concurrent 401 retries, single-flight refresh, account switching, refresh failure, and logout cleanup. Targeted TypeScript checking passes for the changed auth/API modules. Full Next typechecking remains blocked by malformed stale `.next/dev/types/validator.ts` output.

The security and migration tests use synthetic data. Keep tests independent of personal documents, live provider credentials, and shared databases. A passing unit suite does not establish redaction recall for arbitrary documents.

## Current production limitations

- Authentication lifecycle work is in progress; refresh-token rotation/reuse, request throttling, and frontend token coordination require verified tests.
- Active feature modules do not yet share one persistence implementation.
- Resource/time limits, error recovery, and operational readiness need additional tests and controls.
- The health route is not a full readiness probe; no complete root CI release gate is currently documented.
- The sample production Compose file is a draft, not a supported deployment target.

See [architecture and security](../docs/CIPHERA_BACKEND_SECURITY_ARCHITECTURE.md), [migration procedures](alembic/README), and the [production roadmap](../docs/PRODUCTION_REMEDIATION_ROADMAP.md).
