# rvl-sbqr-portal

Web portal for Secure Bangla QR (SBQR), by Relief Validation Limited (RVL). One app serves two audiences, split by the signed-in user's role:

| Surface | Users | Scope |
|---|---|---|
| `src/surfaces/staff` | RVL Admin, RVL Finance | Institutions, rate cards, billing periods, adjustments, reports (Admin and Finance). Crypto keys, QR inspector (Admin only). Admin is the highest role and sees everything Finance sees. |
| `src/surfaces/fi` | Financial-institution users | Own usage, statements, applications and certificate, account. |

Backend: `rvl-secure-bqr-manager` (.NET). This repo holds no backend code.

## Quick start

```
nvm use                # Node 24 (see .nvmrc)
cp .env.example .env   # optional: point SBQR_API_URL at your API
npm ci
npm run dev            # http://localhost:5175
```

Users sign in with a username and password at `POST /v1/auth/login`. The API returns a 15-minute access token (held in memory only; it authenticates later `/v1` calls) and sets a 7-day rotating refresh token as an HttpOnly cookie (`sbqr_rt`, `Path=/v1/auth`) that JavaScript never sees. The portal refreshes the access token a minute before it expires (and on tab focus or reconnect), retries once on a 401, and after a page reload restores the session by calling `POST /v1/auth/refresh`; only a non-secret `sbqr-session` flag is kept in `localStorage` so a reload knows whether to try. Refresh calls are serialized (single in-flight promise plus a Web Lock across tabs) because the API revokes a session if one refresh token is used twice. An account flagged `mustChangePassword` is sent to `/change-password` first. Accounts are created by the platform (`--seed-admin`); there is no self-service sign-up and no mock data: every screen reads the API. How to run and test it by hand: `docs/features/portal-user-login/dev-testing-guide.md` in the workspace repo.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server; proxies `/v1` and `/openapi` to `SBQR_API_URL` (default `http://localhost:5001`) |
| `npm run lint` | oxlint |
| `npm test` | Vitest (jsdom) |
| `npm run build` | Typecheck + production build into `dist/`. On Vercel it also writes `.vercel/output` (see Deploying) |

## Deploying (Vercel)

The browser only calls its own origin, so the deployment must forward `/v1` and `/openapi` to the API. `vercel.json` rewrites cannot read environment variables, so on Vercel `npm run build` runs `scripts/vercel-output.mjs`, which packages `dist/` as a Build Output API bundle with those routes (plus the security headers and SPA fallback) pointed at `SBQR_API_URL`.

1. In Vercel, Project Settings → Environment Variables, set `SBQR_API_URL` for each environment, e.g. `https://rvl-sbqr-api-dev.fly.dev` (https origin only, no path). The build fails if it is missing or malformed.
2. Deploy as usual. Changing the API host means changing the variable and redeploying.

To inspect the generated bundle locally, after a build run `SBQR_API_URL=https://rvl-sbqr-api-dev.fly.dev node scripts/vercel-output.mjs --force` (output goes to the git-ignored `.vercel/output`).

## Status

Shell built. Sign-in, the role-aware layout and per-role navigation work; each screen is a "Not built yet" placeholder. `design/portal-prototype.html` is a clickable prototype of every screen (open it in a browser).

## Layout

```
src/
  App.tsx             router; lazy-loads each surface
  index.css           design tokens (see DESIGN.md)
  surfaces/staff/     RVL Admin and Finance screens
  surfaces/fi/        Institution screens
  pages/login.tsx     username/password sign-in; pages/change-password.tsx
  shared/auth         session store, sign-in, reload restore (refresh cookie)
  shared/layout       AppShell (sidebar, top bar), ComingSoon placeholder
  shared/ui           design-system components
  shared/             format helpers, cn, theme
design/               prototype (visual and behaviour reference)
docs/                 decisions and notes
DESIGN.md             design system guide
AGENTS.md             rules for AI coding agents
```

## Stack

Vite, React 19, TypeScript, Tailwind v4, Radix, TanStack Query, react-hook-form with zod, React Router. Same as `rvl-sbqr-admin-portal`, whose Tenants, Crypto keys and QR Inspector pages can be ported into `src/surfaces/staff`.

## Rules

- Staff and FI screens live under their own `surfaces/` folder and are lazy-loaded after login based on the token's role. An FI user's browser must never download staff screens.
- The API scopes are the real security boundary. UI role checks are convenience only.
- Shared UI (tokens, tables, chips, drawers, charts) goes in `src/shared`.
- Payments and Dues are out of MVP.

## Backend dependencies (not built yet)

- Institution (tenant) user login: only platform users can sign in today, so the `fi` surface is built but unreachable until the API signs tenant users in and puts the tenant on the token.
- Users CRUD (list, create, disable, reset password); accounts come from the `--seed-admin` CLI.
- Per-role scopes beyond `MASTER_ADMIN` on `/v1/admin/*` (only the master admin passes today).
- FI-scoped read endpoints for own usage and statements.
- `FinalizedBy` taken from the token, not the request body.

## Workspace

Lives next to the other submodules in `rvl-sbqr-workspace`. Once a remote exists, add it as a submodule tracking `main` and bump the pointer in the root repo.
