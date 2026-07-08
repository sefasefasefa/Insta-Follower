# Instagram Follower Analyzer

A full-stack web app that lets you log in with your Instagram credentials and view follower analytics — including gender breakdowns and follow/unfollow actions.

## Run & Operate

- `pnpm install` — install all dependencies (run first)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port from `$PORT`)
- `pnpm --filter @workspace/instagram-app run dev` — run the React frontend (port from `$PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/instagram-app/` — React frontend (login page, app page)
- `artifacts/api-server/src/` — Express API server
  - `routes/auth.ts` — Instagram login/logout/session endpoints
  - `routes/followers.ts` — Follower list, follow/unfollow endpoints
  - `lib/instagram.ts` — Instagram API client wrapper
  - `lib/gender.ts` — Gender inference from usernames
- `lib/api-spec/openapi.yaml` — Source of truth for API contract
- `lib/api-client-react/` — Generated React Query hooks (from Orval)
- `lib/api-zod/` — Generated Zod schemas (from Orval)
- `lib/db/src/schema/` — Drizzle ORM schema

## Architecture decisions

- API contract is code-generated from `openapi.yaml` — always run codegen after changing the spec, never edit generated files directly.
- Sessions are currently stored in-process (`Map`) — not persistent across restarts.
- Session tokens are passed via `sessionId` query param for follower reads; login response returns `sessionId` stored in `localStorage`.

## Product

Users sign in with their Instagram username and password (with optional 2FA), then see their followers with gender analytics and can follow/unfollow accounts in bulk.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` to regenerate client hooks and Zod schemas.
- The API server must be running for the frontend session/auth flows to work.
- `DATABASE_URL` is runtime-managed by Replit — do not set it manually.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
