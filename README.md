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

Sign-in uses demo accounts while the API has no per-user login: `.env.example` sets `VITE_MOCK_AUTH=true`, and the login page then lists them (password `Demo@1234`). With the flag off, sign-in is refused. Replace `signIn` in `src/shared/auth/session.ts` when the real endpoint exists.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server; proxies `/v1` and `/openapi` to `SBQR_API_URL` (default `http://localhost:5001`) |
| `npm run lint` | oxlint |
| `npm test` | Vitest (jsdom) |
| `npm run build` | Typecheck + production build into `dist/` |

## Status

Shell built. Sign-in, the role-aware layout and per-role navigation work; each screen is a "Not built yet" placeholder. `design/portal-prototype.html` is a clickable prototype of every screen (open it in a browser; demo password `Demo@1234`).

## Layout

```
src/
  App.tsx             router; lazy-loads each surface
  index.css           design tokens (see DESIGN.md)
  surfaces/staff/     RVL Admin and Finance screens
  surfaces/fi/        Institution screens
  pages/login.tsx     sign-in for both audiences
  shared/auth         in-memory session, sign-in (mock until the API has user login)
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

- Per-user login (today only client-credentials exists).
- Separate Finance role/scope (today a single `admin` scope).
- FI-scoped read endpoints for own usage and statements.
- `FinalizedBy` taken from the token, not the request body.

## Workspace

Lives next to the other submodules in `rvl-sbqr-workspace`. Once a remote exists, add it as a submodule tracking `main` and bump the pointer in the root repo.
