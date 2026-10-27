# Build progress

Updated at the end of each phase. Phases and "done when" criteria come from `CLAUDE.md`. Each phase is on its own branch, stacked on the one before, and stops for review.

| # | Phase | Branch | Status |
|---|---|---|---|
| 0 | Scaffold and questions | `phase-0` | ✅ Done, pushed: awaiting review |
| 1 | Domain engine + tests | `phase-1` | ✅ Done, pushed: awaiting review |
| 2 | Data model, migrations, seed, number service | `phase-2` | ✅ Done, pushed: awaiting review |
| 3 | Auth, users and roles | `phase-3` | ✅ Done, pushed: awaiting review |
| 4 | Inward and outward workflows | `phase-4` | ✅ Done, pushed: awaiting review |
| 5 | Slips and reports (PDF) | `phase-5` | ✅ Done, pushed: awaiting review |
| 6 | File Desk | `phase-6` | ✅ Done, pushed: awaiting review |
| 7 | Dashboard (+ optional attachments) | `phase-7` | ✅ Done, pushed: awaiting review |
| 8 | Hardening and go-live | `phase-8` | 🔨 Built, awaiting the parallel week |

Nothing is merged to `main` yet.

---

## Phase 0: Scaffold and questions ✅
- [x] Next.js + TypeScript + Tailwind, Prisma + PostgreSQL, Vitest, Playwright, ESLint/Prettier
- [x] `.env.example` and README with setup steps
- [x] `npm run dev`, `npm test` and `npm run lint` work on a fresh clone
- [x] Report: models, route map, spec issues, open questions (`docs/PHASE0_REPORT.md`)

## Phase 1: Domain engine + tests ✅
- [x] Date engine (§2): working days, Lagos clock, deemed receipt, registration deadline
- [x] Numbering format (§3.1)
- [x] Inward, outward, file and movement derived fields, statuses and flags (§4–§6)
- [x] Fixtures pass: §12.1 (D1–D13), §12.2, N1, N2, N5 (`docs/PHASE1_REPORT.md`)

## Phase 2: Data model, migrations, seed, number service ✅
- [x] Tables for all SPEC §1 entities, settings, holidays, counters, voids, audit log
- [x] Database protections (no deletes, fixed numbers, append-only audit, single settings row)
- [x] Seed from `seed-data.json`; §12.2 example in dev/test only
- [x] `nextNumber(series, year, tx)` with the prefix from settings
- [x] Migrations run on a fresh DB; N3 (concurrency) and N4 (void) pass (`docs/PHASE2_REPORT.md`)

## Phase 3: Auth, users and roles ✅
- [x] Login with email + password, sessions in the DB, no public sign-up
- [x] Admin creates and manages users; roles and capabilities per SPEC §10
- [x] Password rules, session expiry, lockout after repeated failures (admin can unlock)
- [x] Server-side permission checks on every action and query (deny by default)
- [x] Tests: unit officer can't read another unit's items or write anything
- [x] Tests: only Head of Registry can void; only Admin manages users and settings (`docs/PHASE3_REPORT.md`)

## Phase 4: Inward and outward workflows ✅
- [x] Registry Desk (tiles + buttons)
- [x] New Inward, New Outward
- [x] Item detail and update (inward and outward)
- [x] One-click actions: Forwarded today, Close today, Dispatched today, Delivered today
- [x] Void (Head of Registry, reason required)
- [x] Registers with filters, search and CSV export
- [x] Linked items and audit history on each item
- [x] Validation per SPEC §9 R10; messages per TEMPLATES §4
- [x] The full §12.2 scenario can be entered through the UI and matches the fixtures (`docs/PHASE4_REPORT.md`)

## Phase 5: Slips and reports ✅
- [x] Acknowledgement slip PDF (two copies; heading and footer variants)
- [x] "Save + print slip" and "Save + PDF slip" on New Inward
- [x] Daily Register PDF
- [x] Pending Actions PDF with unit filter
- [x] PDFs for I1, I2 and I3 render correctly (para 10(3) vs general heading; registration vs general footer)
- [x] Daily Registers for 20 Nov 2026 and 2 Dec 2026 list the right items (`docs/PHASE5_REPORT.md`)

## Phase 6: File Desk ✅
- [x] File Index, File Movement, new file
- [x] Issue / Return, "currently with", overdue returns
- [x] "Still out — issue anyway?" confirmation
- [x] Fixtures F1 and F2 pass through the UI (`docs/PHASE6_REPORT.md`)

## Phase 7: Dashboard (+ optional attachments) ✅
- [x] Dashboard per SPEC §8.4, one definition of "pending" (R12)
- [x] Breakdowns: unit, category, month, correspondent, type, LGA
- [x] Scheduled jobs, audit log viewer, workbook import (STACK)
- [ ] Optional, only if Q8 is confirmed: scanned letter uploads (not built: Q8 open)
- [x] Dashboard numbers for 10 Dec 2026 match SPEC §12.2 (`docs/PHASE7_REPORT.md`)

## Phase 8: Hardening and go-live 🔨
- [x] Admin screens: settings, types, lists, holidays (with the 30-day estimated-holiday warning)
- [ ] Backup and restore notes (restore tested) (notes and script done; **restore drill still to do on the server**)
- [x] User guide for registry staff
- [x] Dev seed data cannot reach production
- [x] Hosting notes (Node server + PostgreSQL)
- [x] Vercel hosting (`*.vercel.app`, Neon PostgreSQL, Vercel Cron); Docker/VPS kept as the alternative (`docs/OPERATIONS.md` §3)
- [ ] NDPA sign-off for data held outside Nigeria (Vercel/Neon have no Nigerian region)
- [ ] Parallel week with the workbook; daily counts match (`docs/PARALLEL_RUN.md`, `npm run compare:workbook`; your team runs it)

---

## Open questions

These need an answer from you or the Commission. Until then, the default in brackets applies.

| Q | Question | Needed by | Status |
|---|---|---|---|
| Q1 | Registration deadline rollover; gazetted Effective Date *(no rollover; 2 Nov 2026)* | Go-live | Open |
| Q2 | ACK serial: yearly restart or one sequence *(yearly)* | Go-live | Open |
| Q3 | 17:00 cut-off for hand delivery/courier too? *(email and portal only)* | Go-live | Open |
| Q4 | Which types get the registration slip footer *(REG-01, OUN-01, Deficiency response, Licence/permit, Renewal)* | Phase 5 | Open |
| Q5 | Do unit officers record anything themselves? *(read-only)* | Phase 3 | Open |
| Q6 | Confirm response target days per type *(seed values)* | Go-live | Open |
| Q7 | Real staff list, Secretary's name, who holds each role | Go-live | Open |
| Q8 | Store scanned letters? Size limit, retention *(not built)* | Phase 7 | Open |
| Q-A | OGSERC logo file in `assets/` | Phase 5 | Open |
| Q-B | Official green and gold hex codes | Phase 4 | Open |
| Q-C | Daily Register sign-off in the app, or printed only? | Phase 5 | Open |
| Q-D | May the Head of Registry void items they logged? *(no)* | Phase 3 | Open |
| Q-E | Add the multi-State tick for REG-01? | Phase 4 | Open |
| P1 | Keep "Not forwarded within target" on closed items? *(yes, Excel)* | Phase 4 | Open |
