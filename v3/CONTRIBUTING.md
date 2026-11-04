# Contributing to Ciphera v3

Thank you for helping improve Ciphera. The active application is under `v3/`; do not add runtime imports, build contexts, or test fixtures that depend on the historical `Ciphera/` or `CipheraV2/` prototypes.

## Before opening a change

1. Search the [production roadmap](docs/PRODUCTION_REMEDIATION_ROADMAP.md) for related findings and current constraints.
2. Keep each change focused. Include the regression test with the code that fixes the behavior.
3. Use synthetic documents and identifiers. Never commit real personal documents, credentials, provider keys, database exports, or production logs.
4. For API changes, update the backend schema and relevant client/integration documentation. The generated `/openapi.json` is authoritative.
5. For database changes, add an Alembic migration and test it against disposable SQLite and PostgreSQL databases where the change supports both.

## Development checks

Backend, from `v3/backend`:

```bash
python -m pytest tests -q
python -m alembic upgrade head
```

Frontend, from `v3/frontend`:

```bash
npm ci
npm run lint
npm run build -- --webpack
```

Run the relevant focused tests first, then the closest broader suite. Report unavailable checks with the environment reason; do not describe an unrun check as passing. For security-sensitive changes, test both the allowed and denied cases, including another tenant, revoked membership/session, expired state, and failure/retry paths as applicable.

## Security and privacy review

- Keep authorization decisions in backend dependencies/services, not only in UI visibility.
- Bind every document, job, artifact, and audit operation to the authenticated user and authorized organization.
- Do not log document text, OCR output, entity values, tokens, or report-signing material.
- Validate document format and resource bounds before expensive parsing.
- Route downloadable artifacts through policy checks and independent verification.
- Treat every outbound URL, provider request, uploaded file, and generated PDF field as untrusted input.
- Keep keys in runtime secrets. Rotate any credential that was ever committed or disclosed.

## Database migration discipline

- Never point migration verification at production or a developer's persistent local database.
- Use forward-only migration revisions for deployed schemas; document unsafe or lossy data transformations.
- Preserve tenant ownership and audit history. Stop for a reviewed mapping when ownership cannot be inferred safely.
- Keep one migration history for the canonical v3 PostgreSQL schema. SQLite feature stores are transitional and must not become new persistence patterns.
- Add explicit row-level security policies and allow/deny tests before exposing a Supabase table through its Data API.

## Documentation

Update the relevant README or guide whenever setup commands, environment variables, route behavior, storage, or operational guarantees change. Label planned work separately from current behavior. Avoid claims of certification, compliance, zero retention, or universal redaction without supporting evidence.

## Pull request checklist

- [ ] Change is scoped to v3 and has no prototype imports or data paths.
- [ ] Regression tests cover the reported failure and security deny cases.
- [ ] Database migration is included and tested if the schema changes.
- [ ] Relevant backend/frontend checks are recorded accurately.
- [ ] Documentation and environment examples match the implementation.
- [ ] No secrets, real PII, database files, or generated runtime data are included.
