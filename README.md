# OGSERC Registry System

Internal web app for Ogun State Electricity Regulatory Commission (OGSERC) staff. It replaces the Registry Correspondence Workbook (`reference/OGSERC_Registry_Correspondence_Workbook.xlsm`): inward and outward registers, acknowledgement slips, routing to units, response chasing and the File Desk.

- Business rules: [docs/SPEC.md](docs/SPEC.md)
- Print layouts and messages: [docs/TEMPLATES.md](docs/TEMPLATES.md)
- Stack and architecture rules: [docs/STACK.md](docs/STACK.md)
- Build phases and working rules: [CLAUDE.md](CLAUDE.md)

## Requirements

- Node.js 22.12 or later (`node -v`)
- No Docker needed for local work: `npm run db` starts an embedded PostgreSQL.
  (If you prefer your own PostgreSQL 16+, point `DATABASE_URL` at it instead.)

## Setup on a fresh clone

```sh
npm install                      # also generates the Prisma client
cp .env.example .env             # then fill in BETTER_AUTH_SECRET (command in the file)
npx playwright install chromium  # once, for end-to-end tests
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | App at http://localhost:3000 |
| `npm run db` | Local PostgreSQL on port 5443 (leave it running in its own terminal) |
| `npm run db:test` / `npm run db:e2e` | Separate test databases on ports 5444 / 5445 |
| `npm run db:migrate` | Apply Prisma migrations to the dev database (from Phase 2) |
| `npm test` | Vitest: domain rules and integration tests |
| `npm run test:e2e` | Playwright browser tests (starts the dev server itself) |
| `npm run lint` | ESLint (also stops `src/domain` reading the clock or the database) |
| `npm run typecheck` | TypeScript strict check |
| `npm run format` | Prettier |
| `npm run check` | Everything above that CI runs, plus a production build |

Embedded database files live in `.pgdata/` (git-ignored). Delete a folder there to start that database from scratch.

## Layout

```
src/domain/   pure rules: date engine, numbering, derived fields, statuses, flags (no DB, no clock)
src/server/   data access, server actions, number service, permissions, audit
src/app/      routes (see docs/PHASE0_REPORT.md for the route map)
prisma/       schema, migrations, seed (reads seed-data.json)
scripts/      local tooling (embedded PostgreSQL)
tests/        Vitest tests that are not next to a source file
e2e/          Playwright tests
```

## Time zone

Every "today", deemed-receipt and working-day calculation uses **Africa/Lagos**, whatever the server's time zone. Unit tests run under `TZ=UTC` to catch mistakes. In development, `APP_NOW` (in `.env`) fixes the clock for testing cut-offs and overdue rules.
