# News Reader

A self-hosted news feed reader inspired by Inoreader, built for both humans (web UI) and AI agents (REST API + MCP server). Subscribe to RSS/Atom feeds, organise them in folders, search across articles, automate with rules, and get a personalised morning briefing every day.

## Why

Inoreader is excellent — and expensive at scale. This is an open, self-hosted alternative you run on a small VPS for the cost of a cup of coffee per month. You bring your own AI key (Claude or OpenAI) for summaries and briefings, so you only pay for what you actually use.

## Features

- **Feeds** — RSS, Atom, JSON feeds, with a curated directory of ~35 popular sources across 9 categories (or paste any URL)
- **Reading** — 3 view modes (list, card, magazine), keyboard navigation (`j`/`k`/`o`/`s`/`m`), distraction-free reader, dark/light theme
- **Organisation** — Folders (with drag-and-drop), tags, starring, archiving, full-text search
- **Automation** — Rule engine: `if title contains "X" then star and tag as "Y"` triggers on new articles
- **Morning Digest** — Scheduled daily briefing grouped by folder, with optional AI-generated summaries and key-themes overview
- **AI** — Bring your own API key (Claude Sonnet 4 or GPT-4o-mini) for article summaries, tag suggestions, and digest briefings. Usage tracked with cost estimates.
- **MCP Server** — Streamable HTTP transport at `/mcp` with 18 tools for AI agents (subscribe to feeds, search articles, build digests, etc.)
- **OPML** — Import from other readers, export your subscriptions
- **Stats** — Daily reading metrics, time spent, articles read
- **Multi-user** — JWT auth + long-lived API keys per user
- **Self-hosted** — Single Docker image + Postgres + Redis. No SaaS dependencies.

## Quick Start

```bash
# Clone and bootstrap
git clone <repo>
cd news-reader
cp .env.example .env

# Start Postgres + Redis
docker compose up -d

# Install deps and migrate
pnpm install
pnpm db:migrate

# Run backend + frontend
pnpm dev
```

Then open `http://localhost:5173`, register, click "Add Sources" and pick a few popular feeds. The first batch of articles loads instantly.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | Fastify + TypeScript + Drizzle ORM |
| Database | PostgreSQL 17 (full-text search via GIN) |
| Queue | BullMQ + Redis |
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| State | Zustand (UI) + TanStack Query (server) |
| Feeds | `rss-parser`, `@extractus/article-extractor` |
| AI | Anthropic SDK + OpenAI SDK (BYOAI) |
| MCP | `@modelcontextprotocol/sdk` |

## Architecture

```
packages/
├── shared/    Types and Zod schemas shared between FE/BE
├── backend/   Fastify + Drizzle + BullMQ workers + MCP server
└── frontend/  React SPA
```

The backend services layer is the single source of business logic — REST routes, BullMQ workers, and MCP tools all call the same services, so behaviour is identical regardless of interface.

## Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) — VPS, Fly.io, Railway, Caddy reverse proxy
- [COSTS.md](./COSTS.md) — Hosting + AI provider costs at different scales
- [SECURITY.md](./SECURITY.md) — Hardening checklist, TLS, secrets, API keys
- [BACKUP.md](./BACKUP.md) — pg_dump cron, restore procedures, OPML export

## API & MCP

REST API docs (Swagger): `http://localhost:3000/api/docs`
MCP endpoint: `POST http://localhost:3000/mcp` (Bearer token: JWT or `nrk_...` API key)

Example: connect Claude as an MCP client to browse feeds and build digests.

## License

MIT
