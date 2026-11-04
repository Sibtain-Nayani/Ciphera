This folder contains the **Ciphera v3 browser client**, built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, and Zustand. It calls the FastAPI service in [`../backend`](../backend/README.md) for account and document workflows. Uploaded documents are sent to the configured backend; this is not client-only processing.

The v3 system architecture, security boundaries, and current launch gaps are documented in the [architecture guide](../docs/CIPHERA_BACKEND_SECURITY_ARCHITECTURE.md) and [production roadmap](../docs/PRODUCTION_REMEDIATION_ROADMAP.md).

## Getting Started

Install the locked dependencies and create `.env.local` with the backend URL:

```text
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

`NEXT_PUBLIC_API_URL` is exposed to browser code. For Docker builds it is passed as a build argument and baked into the frontend bundle; use the public HTTPS API origin for a deployed frontend. The backend CORS allowlist must include the frontend origin.

Run the development server:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The main route is `src/app/page.tsx`. The page auto-updates as you edit files under `src/`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Ciphera-specific notes

- API helpers in `src/lib/api.ts` and `src/lib/auth.ts` use `NEXT_PUBLIC_API_URL`.
- Authentication tokens are currently persisted in browser `localStorage`; this increases the impact of a successful same-origin script injection. The browser authentication design remains a production security task.
- User preferences and some session metrics are stored in browser `localStorage`. They are not a server-side retention policy.
- `package.json` provides `dev`, `build`, `start`, `lint`, and `test:auth` scripts. Run `npm run test:auth` for the refresh, account-switching, and logout unit tests; broader browser integration coverage is still needed.
- Review both `next.config.js` and `next.config.ts` before changing configuration; the JavaScript config currently disables build-time TypeScript and ESLint failures, so a successful build alone is not a complete quality gate.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Ciphera backend setup](../backend/README.md)
- [Ciphera documentation index](../docs/README.md)
- [Android API integration guide](../docs/ANDROID_INTEGRATION_GUIDE.md)

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

For Ciphera, set `NEXT_PUBLIC_API_URL` to a reachable HTTPS API origin at build time and configure the backend CORS allowlist for the deployed frontend origin. Do not deploy the frontend as a production product until the auth, route protection, data retention, and release verification gaps in the [production roadmap](../docs/PRODUCTION_REMEDIATION_ROADMAP.md) are closed.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
