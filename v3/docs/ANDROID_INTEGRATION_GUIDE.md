# Android and API client integration (v3)

This guide documents the current v3 API workflow for a native Android client. It is based on routes mounted by `v3/backend/main.py` and `v3/backend/app/api/`. The generated OpenAPI document at `<base-url>/openapi.json` is authoritative for exact schemas; `docs/openapi.json` is a checked-in snapshot for review and client generation.

> **Integration status:** v3 is pre-production. The API still has open authentication lifecycle, persistence consolidation, resource-bound, and deployment findings. Use synthetic data until the release gates in the [production roadmap](PRODUCTION_REMEDIATION_ROADMAP.md) are closed.

## 1. Base URL and transport

| Client | Development base URL | Notes |
|---|---|---|
| Android emulator | `http://10.0.2.2:8000` | Android emulator alias for the host machine |
| Physical device on a trusted LAN | `http://<host-lan-ip>:8000` | Only for local development on a controlled network |
| Physical device over USB | `http://localhost:8000` | Start `adb reverse tcp:8000 tcp:8000` |
| Production | Deployment-provided HTTPS URL | No production hostname is currently defined by this repository |

The backend's default CORS regex includes localhost and the Android emulator alias. Native HTTP clients are not governed by browser CORS, but browser-based clients are. Do not enable cleartext traffic globally in a release Android build; use HTTPS for any deployed environment.

## 2. Authentication

Protected routes use:

```http
Authorization: Bearer <access_token>
```

### Register or log in

```http
POST /api/v3/auth/register
Content-Type: application/json
```

```json
{
  "email": "developer@example.test",
  "password": "use-a-long-test-password",
  "full_name": "Example User"
}
```

Login uses `POST /api/v3/auth/login` with `email` and `password`. Both return a `TokenResponse` containing `access_token`, `refresh_token`, `token_type`, `expires_in`, `user_id`, and `user`. Current code sets the access-token lifetime to 15 minutes and refresh lifetime to 30 days. Refresh rotation is single-use and replay revokes the session family; clients should serialize refresh attempts to avoid treating concurrent use as a token replay.

Store credentials using Android Keystore-backed encrypted storage. Do not put tokens in URLs, logs, crash reports, clipboard, or ordinary preferences. Refresh before retrying the original request and ensure only one refresh request runs at a time.

### Refresh and logout

```http
POST /api/v3/auth/refresh
Content-Type: application/json
```

```json
{ "refresh_token": "<refresh-token>" }
```

On success, replace both stored tokens with the returned values. Logout is `POST /api/v3/auth/logout` with the same request body. Clear local credentials even if the network request fails. `GET /api/v3/auth/me` returns the current user when the access token is valid.

## 3. Document redaction workflow

The current document API accepts PDFs, images, and plain text based on filename/MIME detection. Encrypted PDFs are rejected. The parser currently falls back to text for unknown formats, so clients should allow only formats explicitly supported by their product workflow; server-side strict format rejection remains an open issue.

### Step 1: Upload

```http
POST /api/v3/documents/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

Multipart field `file` is required. An optional `org_id` query parameter selects a workspace; when omitted, the server resolves the user's private workspace. The current defaults limit uploads to 25 MiB and PDFs to 100 pages.

Example response:

```json
{
  "message": "Document parsed successfully",
  "document_id": "<document-id>",
  "metadata": {
    "filename": "example.pdf",
    "type": "pdf",
    "page_count": 1,
    "scanned_pages": [],
    "has_scanned_pages": false
  },
  "page_count": 1
}
```

Upload parsing and entity detection currently happen in the request path. Keep client timeouts appropriate for file size and processing time.

### Step 2: Inspect or revise detected entities

- `GET /api/v3/documents/{document_id}/canonical` returns the canonical representation, including extracted text.
- `GET /api/v3/documents/{document_id}/entities` returns detected entities.
- `PUT /api/v3/documents/{document_id}/entities` replaces the entity list. Each entity follows the `RedactionEntity` schema in `/openapi.json`; set `status` deliberately (`accepted`, `modified`, or `rejected`). Do not assume fields omitted by a client are preserved.

These responses can contain original PII. Keep them out of logs, analytics, and unencrypted local caches.

### Step 3: Queue redaction

```http
POST /api/v3/documents/{document_id}/redact/async
Authorization: Bearer <access_token>
```

Example response:

```json
{
  "message": "Redaction job queued",
  "job_id": "<job-id>"
}
```

The backend needs Redis and a running Celery worker. Poll with backoff rather than a tight loop:

```http
GET /api/v3/documents/redact/jobs/{job_id}
Authorization: Bearer <access_token>
```

The response includes `job_id`, `status`, `error_message`, and `has_artifact`. Current terminal outcomes include `completed`, `failed`, and `review_required`. Scanned/raster pages may be routed to `review_required`; an artifact is not made available for that state.

The verified export job currently accepts only a `.pdf` file uploaded as `application/pdf`. Other formats receive `415 Unsupported Media Type` until a format-specific verifier is implemented.

### Step 4: Download

```http
GET /api/v3/documents/redact/jobs/{job_id}/download
Authorization: Bearer <access_token>
```

Download is allowed only for an authorized tenant when the job is completed, the result key is in the redacted area, the document has a verified safety status, and the stored PDF bytes match the checksum recorded by the worker. Local and S3 modes return the checksum-verified bytes through the API; the client does not receive a storage URL.

## 4. Text analysis

`POST /api/v3/analyze` accepts JSON with `text`, `threshold`, `enabled_stages`, `clean_ocr`, and `include_context`. It currently has no authentication dependency. Its response can include the original entity `text` and context; do not use this public route for sensitive data on an internet-accessible deployment until access controls and rate limits are reviewed.

## 5. Other useful endpoints

| Method and path | Use |
|---|---|
| `GET /api/v3/health` | Basic API/pipeline process status; not full DB/Redis/worker readiness |
| `GET /api/v3/entities` | List entity types |
| `GET /api/v3/org/me` | List current user's organization memberships |
| `GET /docs` | Interactive Swagger UI in development |
| `GET /openapi.json` | Generated API schema |

API keys and webhooks have routes in the current server, but they still use transitional persistence/auth paths. Their contracts are not recommended for a production mobile integration until A01/S05 remediation is complete.

## 6. Status and client error handling

| HTTP status | Client behavior |
|---:|---|
| `200` | Parse the endpoint response; upload and job creation currently return 200, not 201 |
| `400` | Invalid state or unsupported processing input; show safe error and preserve no unredacted artifact |
| `401` | Missing, expired, invalid, or revoked authentication; attempt one serialized refresh, then clear credentials and prompt sign-in |
| `403` | Authenticated but not authorized, or artifact release blocked |
| `404` | Document/job not found or not visible to this tenant |
| `413` | Upload exceeds configured byte limit |
| `422` | Request validation error or document/job requires review |
| `5xx` | Transient/service error; retry only idempotent operations with bounded backoff |

Use the API's actual response status and schema from OpenAPI rather than assuming that all errors share a single shape.

## 7. Security and privacy checklist

- Require HTTPS outside local development.
- Keep bearer and refresh tokens in Android Keystore-backed encrypted storage; serialize refresh requests.
- Do not log authorization headers, uploaded document bytes, canonical text, detected entity values, or report signatures.
- Encrypt local document caches and delete them according to the product's retention policy.
- Do not expose `/api/v3/analyze`, API-key routes, or webhooks publicly without their open authorization, rate-limit, and SSRF findings being closed.
- Confirm that the selected deployment has private storage, backup/retention settings, and a documented incident response path.

For the system data flow and current limitations, see [Architecture and security](CIPHERA_BACKEND_SECURITY_ARCHITECTURE.md). For changes to endpoint schemas, update this guide and verify against `/openapi.json`.
