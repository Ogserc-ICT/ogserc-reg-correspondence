# Phase 8 report

Branch `phase-8` (stacked on `phase-7`). Hardening and go-live.

## 1. What's built

| CLAUDE.md asks for | Where |
|---|---|
| Admin screens for settings, types, lists and holidays | Settings (Admin, Phase 3); **Reference** (Head of Registry): `/admin/types`, `/admin/lists`, `/admin/holidays` |
| Holiday status Fixed / Provisional / Estimated, warning for holidays in the next 30 days | Holidays screen, Registry Desk and the Holiday check job. Also warns when the calendar runs out |
| Database backup and restore notes | `scripts/backup-db.sh`, the **Backup check** job, and [OPERATIONS.md](OPERATIONS.md) §5 (restore drill before go-live) |
| User guide for registry staff, from the workbook's Guide sheet | [USER_GUIDE.md](USER_GUIDE.md) |
| Dev seed data can't reach production | In production the server exits at start if it finds dev accounts, a test clock, a short auth secret or `DEV_SEED_PASSWORD`. The seed's example/login modes refuse to run in production |
| Hosting notes (Node server + PostgreSQL) | [OPERATIONS.md](OPERATIONS.md), `Dockerfile`, `docker-compose.prod.yml`, `.env.production.example` |
| Parallel week, daily counts match | `npm run compare:workbook` and [PARALLEL_RUN.md](PARALLEL_RUN.md) |

**Reference screens:**
- Types: changes apply to newly logged items. Items already logged keep the rules they were saved with.
- List values the rules use can be renamed but not switched off.
- A unit can't be switched off while types route to it or unit officers belong to it.
- Any holiday change recalculates every item's status straight away.
- All changes are audited.

**Also added:**
- A sign-in **proxy**: anyone without a session cookie gets a proper 307 to `/login` instead of an empty page.
- Forms on the reference screens keep what was typed after an error.

## 2. Tested

`npm test`: 230 pass. `npm run test:e2e`: 15 pass. Among them:
- **Holidays (browser test):** the Head of Registry adds a holiday; I2's due date moves from 15 to 16 Dec, and back when it's removed.
- **Reference rules:** type changes don't touch saved items; renamed keyed values still drive the rules; a unit in use can't be switched off.
- **Start-up guard:** unit-tested, then run for real. A production build against the dev database printed the reason and exited. A rehearsal on a fresh production-like database ran migrations, seed, `admin:create` and start, and `/` gave a 307 to `/login`.
- **Backup check:** missing, empty and stale backups all fail; a recent one passes.
- **Parallel-run comparison:** every day matches after importing the workbook; voiding one item makes that day show the difference.

## 3. Not done here: needs the Commission

**Done-when (parallel week):** only your team can run it. Follow [PARALLEL_RUN.md](PARALLEL_RUN.md).

**Tool trial:** on your dev data, the comparison already finds one real difference. The workbook's example letter to NERC is dispatched on 8 Dec, while the SPEC fixture says 3 Dec.

**Untested on this machine:**
- The Docker image hasn't been built (no Docker here). The non-Docker steps it runs were rehearsed.
- `scripts/backup-db.sh` hasn't been run (no `pg_dump` here). Do the restore drill in OPERATIONS.md §5 before go-live.

**Still open:** Q1–Q8 and Q-A–Q-E. Most are now settings or reference data the Head of Registry can change on screen. The logo (Q-A) and brand colours (Q-B) are still needed.

## 4. Decisions to check

1. Holidays can be **deleted** (audited), unlike items, so an estimated date that never happens can be removed.
2. The receipt-mode cut-off flags (Q3) are edited by the **Head of Registry** on the Lists screen, not by the Admin.
3. The start-up guard treats any `@example.invalid` account as dev data. Don't use that domain for real accounts.
