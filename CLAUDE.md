# OGSERC Registry System

Internal web app for Ogun State Electricity Regulatory Commission (OGSERC) staff. It replaces the macro workbook in `reference/OGSERC_Registry_Correspondence_Workbook.xlsm`. It records every item of correspondence the Commission receives (inward) or sends (outward), issues acknowledgement slips (para 10(3) of Order No. OGSERC/ORD/2026/001), routes inward items to units, chases responses in both directions, and tracks where every physical file is.

This is a **standalone app** with its own repo and database. It is **not** the Registration & Evaluation app, although both use the `OGSERC/ACK` number series (see `docs/SPEC.md` §3.3).

## Source of truth
- `docs/SPEC.md`: every business rule, status order, flag, action, number format and test fixture. **Read it before changing any domain logic.** If code and spec disagree, the spec wins. If the spec is unclear, ask; do not guess.
- `docs/TEMPLATES.md`: acknowledgement slip, Daily Register and Pending Actions layouts and wording; on-screen messages.
- `seed-data.json`: incoming/outgoing correspondence types, units, LGAs, lists, settings, public holidays. Seed from this file; never hard-code these values in components.
- `reference/*.xlsm` and `reference/vba/`: the original workbook and its macros, for cross-checking only. It has known problems (SPEC §9); do not copy its behaviour where the spec says otherwise.
- `assets/`: OGSERC logo for the slip and reports.

## Stack
- Next.js (App Router) + TypeScript (strict), Tailwind CSS
- PostgreSQL + Prisma
- Auth.js with email + password (argon2 hashing); sessions in the DB. No public sign-up; admins create users.
- Zod for validation, shared between forms and server actions
- PDF: `pdf-lib` (or `@react-pdf/renderer`) on the server. No dependency on Word or LibreOffice.
- Tests: Vitest for domain and integration tests; Playwright for end-to-end flows.

## Project layout
- `src/domain/` — pure functions only: date engine, numbering format, derived fields, statuses, flags. No DB access, no `Date.now()`; `now` is always a parameter.
- `src/server/` — data access, server actions, number service, permission checks, audit logging.
- `src/app/` — routes: `/` (Registry Desk), `/inward/new`, `/outward/new`, `/inward`, `/outward`, `/inward/[id]`, `/outward/[id]`, `/files`, `/files/[id]`, `/pending`, `/daily`, `/dashboard`, `/admin/*`.
- `prisma/` — schema, migrations, `seed.ts` (reads `seed-data.json`; the SPEC §12.2 example scenario only in dev/test).

## Non-negotiable rules
1. **Africa/Lagos everywhere.** All "today", deemed-receipt and working-day calculations use Lagos time with an injected `now`. Never use the server's local date (it may be UTC).
2. **Numbers are assigned once, inside the insert transaction, and never change.** No deletes of inward or outward items; void with a reason (Head of Registry only). Voided numbers are never reissued.
3. **Status is derived, never typed.** Compute it from stored facts (SPEC §4.3, §5.3, §6.2).
4. **Every write is audited**: user, time, action, changed fields before/after.
5. **Links are foreign keys** chosen from a searchable picker, not typed numbers.
6. **Permissions are checked on the server** for every action and every query. Deny by default. Unit officers see only their unit's items.
7. Domain logic has unit tests; the fixtures in SPEC §12 are the acceptance tests.
8. Secrets only in `.env` (never committed); `.env.example` lists every variable.

## Build phases (stop at the end of each phase, summarise, and wait for review)

### Phase 0 — Scaffold and questions
Create the Next.js + TypeScript + Tailwind project, Prisma with PostgreSQL, Vitest, Playwright, ESLint/Prettier, `.env.example`, and a README with setup steps. Then write a short report: proposed Prisma models, the route map, anything in SPEC you think is wrong or ambiguous, and the open questions in SPEC §11 and §3.3 that block you.
**Done when:** `npm run dev`, `npm test` and `npm run lint` all work on a fresh clone, and the report is written.

### Phase 1 — Domain engine + tests
Date engine (§2), numbering format (§3.1), derived fields, statuses and flags for inward, outward, files and movements (§4–§6), as pure functions.
**Done when:** every fixture in SPEC §12.1, §12.2 and N1, N2, N5 passes.

### Phase 2 — Data model, migrations, seed, number service
Tables for the SPEC §1 entities, settings, holidays, number counters, voids, audit log. Seed reference data from `seed-data.json`. Number service `nextNumber(series, year, tx)` with the prefix taken from settings.
**Done when:** migrations run on a fresh DB; N3 (concurrency) and N4 (void) pass as integration tests.

### Phase 3 — Auth, users and roles
Login, sessions, admin-managed users, roles and capabilities per SPEC §10, login lockout after repeated failures, password rules, session expiry. Server-side checks on every action and query.
**Done when:** tests prove a unit officer cannot read another unit's items or perform any write, only Head of Registry can void, and only Admin can manage users and settings.

### Phase 4 — Inward and outward workflows
Registry Desk (tiles + buttons), New Inward, New Outward, item detail and update (inward and outward), one-click actions (Forwarded today, Close today, Dispatched today, Delivered today), void, registers with filters, search and CSV export, linked items and audit history on each item. Validation per SPEC §9 R10. Messages per TEMPLATES §4.
**Done when:** the full §12.2 scenario can be entered through the UI and every computed value on screen matches the fixtures.

### Phase 5 — Slips and reports
Acknowledgement slip PDF (two copies; heading and footer variants), Daily Register PDF, Pending Actions PDF with unit filter. "Save + print slip" and "Save + PDF slip" on New Inward.
**Done when:** PDFs for I1, I2 and I3 render correctly (para 10(3) vs general heading; registration vs general footer), and the Daily Registers for 20 Nov 2026 and 2 Dec 2026 list the right items.

### Phase 6 — File Desk
File Index, File Movement, Issue / Return / New file, "currently with", overdue returns.
**Done when:** fixtures F1 and F2 pass through the UI, including the "still out — issue anyway?" confirmation.

### Phase 7 — Dashboard (+ optional attachments)
Dashboard per SPEC §8.4 with one definition of "pending" (R12). Optional, only if the user confirms Q8: upload scanned letters to an inward item (PDF/JPG/PNG only, size limit, stored outside the web root or in object storage, access checked per role).
**Done when:** dashboard numbers for 10 Dec 2026 match SPEC §12.2.

### Phase 8 — Hardening and go-live
Admin screens for settings, types, lists and holidays (holiday status Fixed / Provisional / Estimated, with a warning when an estimated holiday falls in the next 30 days). Database backup and restore notes. A short user guide for registry staff based on the workbook's Guide sheet. Make sure dev seed data cannot reach production. Hosting notes (needs a Node server and PostgreSQL).
**Done when:** the user has run a parallel week with the workbook and the daily counts match.

## Working style
- Plan first, then make small commits per sub-step, on a feature branch per phase.
- Never run destructive DB commands against anything but the local/test database.
- When a rule needs a decision from the Commission, make it a setting with the Excel behaviour as the default, and list it in your phase summary.
