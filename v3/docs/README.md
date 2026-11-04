# v3 documentation

This index separates current behavior from planned architecture and research. The generated FastAPI OpenAPI document is the source of truth for API schemas; endpoint prose and example requests should stay aligned with it.

## Start here

| Document | Audience | Source of truth for |
|---|---|---|
| [v3 overview](../README.md) | Developers and evaluators | Project status, stack, local setup, data handling |
| [Backend guide](../backend/README.md) | Backend developers and operators | API/worker setup, migrations, persistence limitations |
| [Frontend guide](../frontend/README.md) | Web developers | Next.js commands, API URL, current browser auth behavior |
| [Architecture and security model](CIPHERA_BACKEND_SECURITY_ARCHITECTURE.md) | Engineers, reviewers, security auditors | Current runtime flows, data stores, trust boundaries, target architecture |
| [Production remediation roadmap](PRODUCTION_REMEDIATION_ROADMAP.md) | Project team | Ordered findings, acceptance gates, status, launch blockers |
| [Android/API integration guide](ANDROID_INTEGRATION_GUIDE.md) | Mobile/API client developers | Supported v3 workflow and client handling guidance |
| [Research evaluation report](CIPHERA_RESEARCH_EVALUATION_REPORT.md) | Research and evaluation readers | The experiment and benchmark scope stated in that report |
| [UI redesign specification](CIPHERA_UI_REDESIGN_SPECIFICATION.md) | Product/design contributors | UI design intent; verify against implementation before using as behavior documentation |
| [Research methodology](../research/methodology.md) | Research contributors | Evaluation methodology |
| [Held-out baseline inventory](../research/held_out_benchmark/DEVELOPMENT_BASELINE_INVENTORY.md) | Research contributors | Dataset/evaluation asset inventory |
| [Held-out freeze record](../research/held_out_benchmark/FREEZE_RECORD.md) | Research contributors | Frozen benchmark provenance and scope |

## Documentation rules

1. Mark statements as **current**, **planned**, or **not verified** when implementation status differs.
2. Do not claim zero retention, universal detection, legal compliance, certification, or production readiness without operational evidence and a defined scope.
3. Never include real tokens, secrets, personal documents, detected PII, production hostnames, or customer data in examples.
4. Derive API routes and models from `/openapi.json`; the committed docs do not contain a generated OpenAPI snapshot.
5. Keep deployment examples explicit about local-only credentials, public ports, required secrets, storage durability, and migration procedures.
6. Use Mermaid diagrams for current runtime/data-flow diagrams and visibly label target-state components that are not implemented.

## Current documentation gaps

- The v3 application is pre-production; the roadmap controls release readiness.
- Supabase PostgreSQL is a target migration, not the current sole database. Several feature modules still use SQLite directly.
- Mobile API examples describe only implemented routes. The API remains authoritative when a route contract changes.
- Research metrics are bounded to their documented datasets and must not be presented as a guarantee for arbitrary customer documents.
