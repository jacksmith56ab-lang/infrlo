# BotDesk — Telegram bot admin panel

BotDesk is a responsive React admin panel, a standalone REST API, and a Telegram bot worker. The API is the only process that connects to PostgreSQL. Both the admin panel and the bot use the same data through that API.

## What is included

- Dashboard with user, product, order, revenue, API, and bot status summaries
- User search and management, block/unblock, balance adjustments, and balance history
- Product create/edit/hide/delete with stock, category, price, and a public photo URL
- Order list, line-item details, status changes, and stock restoration when an order is cancelled
- Bot welcome text, name, support contact, currency, enabled state, and administrator contact settings
- Telegram commands: `/start`, `/catalog`, `/buy PRODUCT_ID [QUANTITY]`, `/balance`, and `/help`
- `GET /api/healthz` checks that the API and database are responding

## Requirements

- Node.js 22.9 or newer (Node.js 24 is recommended)
- pnpm
- A PostgreSQL database reachable by the API service
- A Telegram bot token from BotFather if you want to run the bot

## Environment variables

Copy `.env.example` to `.env` for local development. Never commit `.env`, and do not put `BOT_TOKEN` in frontend variables.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API | PostgreSQL connection string |
| `PORT` | API and frontend server | Port provided by the host; the services bind to `0.0.0.0` |
| `CORS_ORIGIN` | API | Public frontend origin, for example `https://admin.example.com` |
| `BOT_TOKEN` | Telegram worker | BotFather token; store it in the host's secret settings |
| `API_BASE_URL` | Telegram worker | Full API base, including `/api`, e.g. `https://api.example.com/api` |
| `VITE_API_URL` | Frontend build | API origin only, without `/api`, e.g. `https://api.example.com` |

## Install and run locally

```bash
corepack enable
pnpm install
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL`. Then create the tables and start the API:

```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
```

In a second terminal, start the web admin:

```bash
pnpm --filter @workspace/telegram-admin run dev
```

To run the Telegram bot, set `BOT_TOKEN` and `API_BASE_URL` in `.env`, then start it in another terminal:

```bash
pnpm --filter @workspace/telegram-bot run start
```

The API and web development servers use the `PORT` and `BASE_PATH` values supplied by their host/workflow. The bot is a worker and does not open an HTTP port.

## Build and start commands

### Frontend — FadeHost

Set `VITE_API_URL` in the build environment to the API origin **without** `/api`, then build:

```bash
VITE_API_URL=https://YOUR-INFRLO-API-DOMAIN pnpm --filter @workspace/telegram-admin run build
```

The static build is in `artifacts/telegram-admin/dist/public`. To run it as a Node service, set the host-provided `PORT` and start:

```bash
pnpm --filter @workspace/telegram-admin run start
```

The server binds to `0.0.0.0` and serves the built single-page app with client-side route fallback.

### REST API — Infrlo

Set `DATABASE_URL` and `CORS_ORIGIN` in the API service environment. Run the schema command once against that database, then build and start:

```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

Infrlo should supply `PORT`; the API binds to `0.0.0.0`. Verify it at `https://YOUR-INFRLO-API-DOMAIN/api/healthz`.

### Telegram worker — Infrlo

Create a second worker/service using the same repository. Set `BOT_TOKEN` and `API_BASE_URL` (including `/api`) in its secret/environment settings:

```bash
pnpm --filter @workspace/telegram-bot run build
pnpm --filter @workspace/telegram-bot run start
```

The worker does not need a database connection of its own; it sends Telegram users and orders to the API, which persists them in the shared PostgreSQL database. Run only one polling worker per bot token.

## Telegram bot behavior

1. A user sends `/start`; the worker registers their Telegram ID through `PUT /api/bot/users`.
2. `/catalog` shows active, in-stock products from the API.
3. Choosing a product or using `/buy` creates an order. The API checks stock and records an item/price snapshot transactionally.
4. The admin can update order state. Cancelling an order restores its reserved stock.
5. `/balance` reads the same user balance shown in the panel.

The API contract is in `lib/api-spec/openapi.yaml`. PostgreSQL table definitions are in `lib/db/src/schema/bot-admin.ts`.

## Important security note

As requested, there is **no login or API authentication**. Anyone who can reach the panel/API can read and change its data, including balances and orders. Do not expose the services publicly with real customer data or real balances unless you first add network access restrictions or authentication. The Telegram token is only read by the bot worker from an environment secret and is never returned by the API.

Product photos are entered as public image URLs; this version does not upload image files.
