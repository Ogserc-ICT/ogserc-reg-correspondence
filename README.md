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
| `npm run db:migrate` | Apply Prisma migrations to the dev database |
| `npm run db:seed` | Reference data from `seed-data.json` (fills empty tables only; safe to re-run) |
| `npm run db:seed -- --example` | Also the SPEC §12.2 example items and one dev login per role (dev/test only; refused in production) |
| `npm run db:seed -- --logins --files` | Dev logins and the two example files only, with empty registers (what the e2e tests use) |
| `npm run import:workbook -- --file <xlsm> --as <email>` | Import the workbook (dry run unless `--commit`) |
| `npm run admin:create -- --email <email> --name "<name>"` | First admin account on a new database; prints a temporary password once |
| `npm test` | Vitest: domain rules, plus integration tests against a fresh local test database |
| `npm run test:e2e` | Playwright browser tests on a fresh, seeded e2e database (starts it and the dev server itself) |
| `npm run lint` | ESLint (also stops `src/domain` reading the clock or the database) |
| `npm run typecheck` | TypeScript strict check |
| `npm run format` | Prettier |
| `npm run check` | Everything above that CI runs, plus a production build |

Embedded database files live in `.pgdata/` (git-ignored). Delete a folder there to start that database from scratch.

### First run of the dev database

```sh
npm run db                        # terminal 1: leave running
npm run db:migrate                # terminal 2
npm run db:seed -- --example      # reference data + the workbook example
```

### Signing in locally

After `npm run db:seed -- --example`, each role has a dev login, all with the password `Dev only pass 2026!` (or `DEV_SEED_PASSWORD` from `.env`):

| Email | Role |
|---|---|
| `admin@example.invalid` | Admin (users, settings) |
| `head.registry@example.invalid` | Head of Registry |
| `registry.officer1@example.invalid` | Registry officer |
| `secretary@example.invalid`, `chairman@example.invalid` | Secretary / management |
| `unit.registration@example.invalid` | Unit officer, Registration & Licensing |

On a real database there are no dev logins: create the first admin with `npm run admin:create`, then add everyone else on the Users screen. New users get a temporary password and must change it at first sign-in. After 5 wrong passwords in a row an account is locked for 15 minutes; an admin can unlock it sooner. Sessions last 12 hours and are extended while in use.

### Integration tests

`npm test` needs no database running. If nothing answers on `DATABASE_URL_TEST`, it starts the local test cluster (port 5444) itself, and stops it again at the end. Each run drops and recreates the test database, then applies the migrations. The test setup refuses any database that is not on localhost or whose name does not end in `_test`.

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

## Scheduled jobs

Admins see the jobs on **Jobs** (`/admin/jobs`) and can run them there. To run them on a schedule, set `CRON_SECRET` and have the server's scheduler call, e.g. nightly at 00:30 Lagos time:

```sh
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/jobs/refresh-status
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/jobs/holiday-check
```

## Importing the workbook (parallel run)

```sh
npm run import:workbook -- --file <workbook.xlsm> --as <head-of-registry email>            # dry run
npm run import:workbook -- --file <workbook.xlsm> --as <head-of-registry email> --commit   # save
```

A dry run changes nothing and reports what would be imported, skipped, and any problems. Numbers are kept, links resolved, and re-running never duplicates. See `docs/PHASE7_REPORT.md`.

## Printing

Slips, the Daily Register and Pending Actions are PDFs made on the server. Put the OGSERC logo in `assets/logo.png` (or `.jpg`) and they print it; without it they print a text heading. The fonts in `assets/fonts/` (DejaVu Sans, free licence included) are embedded so `₦` and `✂` print correctly.

## Time zone

Every "today", deemed-receipt and working-day calculation uses **Africa/Lagos**, whatever the server's time zone. Unit tests run under `TZ=UTC` to catch mistakes. In development, `APP_NOW` (in `.env`) fixes the clock for testing cut-offs and overdue rules.
