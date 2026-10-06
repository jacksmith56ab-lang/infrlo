# BotDesk

A responsive dashboard, standalone REST API, and Telegram bot worker for managing users, balances, products, orders, and bot settings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/telegram-admin run dev` — run the React/Vite admin
- `pnpm --filter @workspace/telegram-bot run start` — run the Telegram polling worker
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`; bot worker also needs `BOT_TOKEN` and `API_BASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/telegram-admin` — responsive React/Vite control panel and standalone static server
- `artifacts/api-server` — REST API, mounted under `/api`
- `bot` — Telegram long-polling adapter and bot command handlers
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/bot-admin.ts` — PostgreSQL schema
- `README.md` — local setup and FadeHost/Infrlo deployment instructions

## Architecture decisions

- The API owns the database connection; the admin and Telegram worker use the same REST API and therefore share the same persisted data.
- Telegram transport is isolated in `bot/adapters/telegram.mjs`, separately from command and order handling.
- Frontend requests use same-origin `/api` in development and a build-time `VITE_API_URL` origin when deployed separately.
- Authentication is intentionally absent by user request; the API and all mutations are public unless protected by host/network controls.
- Product images are managed by public URL; no file-storage provider is required.

## Product

Manage Telegram bot users, wallet balances, catalog, inventory, and order fulfillment from a dark responsive dashboard. Configure the bot's welcome message and administrator contact, monitor the API and bot heartbeat, and let users browse/order products from Telegram.

## User preferences

- Keep this as a fresh, straightforward project; do not add Telegram Login or local authentication.
- Keep the frontend and backend independently deployable and use `PORT`/`0.0.0.0`.

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI edit.
- Apply schema changes to the selected PostgreSQL database with `pnpm --filter @workspace/db run push`.
- `VITE_API_URL` is the API origin only (no `/api`); `API_BASE_URL` for the bot includes `/api`.
- Run one long-polling process per Telegram bot token.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
