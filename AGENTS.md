# AGENTS.md

Guidance for AI coding agents working in `rvl-sbqr-portal`. Humans: README.md and DESIGN.md are the source of truth.

## What this is

One React SPA for Secure Bangla QR with two surfaces, `src/surfaces/staff` (RVL Admin, Finance) and `src/surfaces/fi` (financial-institution users). The backend is `rvl-secure-bqr-manager` (.NET); no backend code here. This repo is an independent git repo and a sibling submodule in `rvl-sbqr-workspace`.

## Commands

```
npm ci            # install
npm run dev       # http://localhost:5175, proxies /v1 and /openapi to SBQR_API_URL
npm run lint      # oxlint
npm test          # vitest
npm run build     # tsc -b && vite build
```

Run lint, test and build before saying work is done.

## Rules

- Never import across surfaces. Shared code goes in `src/shared`.
- Surfaces are lazy-loaded; keep it that way. An FI user must not download staff screens.
- UI role checks are convenience only. The API scopes are the security boundary; do not rely on hiding buttons.
- Use design tokens and the components described in DESIGN.md. No raw hex, no new UI library.
- All requests are same-origin (`/v1/...`). Do not add CORS workarounds or absolute API URLs.
- Sign-in is username and password (`POST /v1/auth/login`); client credentials are not used by the portal. No mock or sample data in `src`: every screen reads the API, and tests stub the API with `src/test/fake-backend.ts`.
- Keep the access token in memory only. The refresh token lives only in the API's HttpOnly cookie; the portal never reads or stores it. The one thing written to localStorage is the non-secret `sbqr-session` flag (plus the theme). Never write tokens, passwords or keys to storage, logs, or the repo. Provisioned secrets are shown once.
- Refresh calls go through `refreshSession()` in `src/shared/api/client.ts` and nowhere else: the API revokes the whole session when a refresh token is replayed, so refreshes must stay serialized.
- Do not commit `.env`; update `.env.example` instead.
- Payments and Dues are out of MVP.
- Money: use the formatter in `src/shared`, never ad-hoc `toFixed`. Billing periods are `YYYY-MM` strings.
- Keep it simple. No state library beyond TanStack Query, no CSS-in-JS, no premature abstraction.

## Git

Commit inside this repo only. Branch off `main`. Follow the workspace conventions (`/rvl-create-branch`, `/rvl-commit`) when available. Never force-push.

## Reference

- `design/portal-prototype.html`: clickable prototype of every screen with realistic flows (finalize blocked by queued usage, rate card validation, QR inspector, etc.). Match behaviour and copy.
- `rvl-sbqr-admin-portal`: existing staff-only app; port Tenants, Crypto keys and QR inspector from it, mapping its colours to the tokens here.
