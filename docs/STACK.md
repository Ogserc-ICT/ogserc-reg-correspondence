# Stack: OGSERC Registry System

Internal, staff-only web app that replaces the **OGSERC Registry Correspondence Workbook** (`reference/OGSERC_Registry_Correspondence_Workbook.xlsm`; the reworked v2 workbook is `reference/OGSERC_Registry_Correspondence_Workbook_New.xlsm`, see `docs/SPEC-v2-CHANGES.md`). It logs inward and outward correspondence, issues para 10(3) acknowledgement slips, routes items to units, chases responses both ways, and tracks physical files. Built with Claude Code in phases (see `CLAUDE.md`).

What the workbook does, and therefore what this stack has to handle well:

- **Two registers with generated numbers**: `OGSERC/ACK/YYYY/00000` and `OGSERC/OUT/YYYY/00000`.
- **Timestamp-sensitive legal dates.** Under para 10(3), an email received at 17:00 or later, or on a weekend or holiday, is deemed received on the next working day.
- **Working-day due dates** worked out from a public-holiday table, using Excel `WORKDAY` / `NETWORKDAYS` semantics.
- **Derived statuses and data flags**, recalculated every day: overdue, awaiting forwarding, delivery not confirmed, and so on.
- **Links between items**: replies to inward items, responses to outward letters, and the file each item sits on.
- **Printable outputs**: a two-copy acknowledgement slip, the Daily Register for sign-off, and the Pending Actions list.
- **A dashboard**, plus breakdowns by unit, category, month, correspondent and LGA.
- **A front desk intake log**, a **routing step** by the Secretary / Head of Administration, and an **acknowledgement email** to the unit (SPEC-v2 C3, C5, C6).
- **No payments and no multi-step approvals.** The workflow is registry-centric: front desk, register, route, forward, reply, close.

---

## Core stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router)** | Server components for pages and registers; server actions for every state change (save, forward, close, dispatch, deliver, issue file, void) |
| Language | **TypeScript (strict)** | |
| Styling | **Tailwind CSS** | OGSERC green and gold as theme tokens: `<paste the hex values from the OGSERC website project>`. Status colours follow the workbook: red = overdue, amber = awaiting action, green = closed, peach = flagged. Never rely on colour alone; always show the status text too. |
| Database | **PostgreSQL** | |
| ORM / migrations | **Prisma** | `prisma migrate`, `prisma/seed.ts` reads `seed-data.json` |
| Auth | **Better Auth** (email + password, database sessions) | Admin-created accounts only, with no public sign-up |
| Password hashing | **@node-rs/argon2** | Prebuilt binaries, so it works on Windows |
| Validation | **Zod** | Same schemas for forms and server actions |
| Dates and time zones | **date-fns + @date-fns/tz** | Every "today" and every time-of-day check is done in **Africa/Lagos**. Working-day helpers are written in `src/domain/`, not taken from a library, so they match Excel exactly. |
| PDF generation | **pdf-lib** (or **@react-pdf/renderer**) | Server-side. Covers the two-copy A4 slip, the Daily Register and Pending Actions. No Word or LibreOffice. |
| Charts | **Recharts** | Used only for the monthly trend and the unit breakdown on the dashboard. Colour-blind-safe palette, a "Show as table" fallback, and no dual-axis charts. Most dashboard figures are plain counts in tiles. |
| CSV export | Built-in (stream from a route handler) | One export per register, with the same filters as on screen |
| Unit tests | **Vitest** | Domain rules plus database tests |
| End-to-end tests | **Playwright** | Real browser flows per role |
| Lint / format | **ESLint + Prettier** | Typecheck, lint, format and build must all pass |
| Local database | **docker-compose** (main) / **embedded-postgres** (no Docker) | `embedded-postgres` also gives tests throwaway databases |
| Scheduled jobs | Cron calling a protected route, plus a manual "Run now" button | Runs in Africa/Lagos. Jobs: nightly backup check, morning overdue summary (optional), and a warning when an estimated holiday falls within 30 days |

## Hosting

| Item | Choice |
|---|---|
| Server | Linux VPS in Lagos (or in-country), billed in naira where possible. 2 vCPU / 4 GB RAM / 80 GB SSD is enough for this app plus the Registration & Evaluation app |
| Deploy panel | **Coolify** (self-hosted): git-push deploys, automatic SSL, managed Postgres, scheduled backups |
| Packaging | Dockerfile + production compose |
| Backups | Nightly database backups to object storage in the same jurisdiction. **Test a restore before go-live.** Scanned letters, if added (Q8), are backed up too |
| Monitoring | UptimeRobot (or similar) |
| Server hygiene | Automatic security updates, SSH keys only, firewall open on 80/443/SSH only |
| Access | Staff-only: logins plus, ideally, an office IP allowlist or VPN |
| Ownership | Hosting account and billing in the Commission's name, with at least two admins |

Not suitable: shared cPanel/DirectAdmin hosting. It can't reliably run Node.js with PostgreSQL.

---

## Architecture rules

These matter more than the libraries. Rules marked **(Registry)** come from how the workbook was built.

1. **Domain logic as pure functions** in `src/domain/`, with no database or framework imports, and `now` always passed in. This covers:
   - the deemed receipt date
   - working-day due dates
   - inward and outward status order
   - every data flag
   - file "currently with" and overdue returns
   - the registration deadline

   UI and server actions call these functions, and unit tests cover every rule in `docs/SPEC.md`.

2. **(Registry) One date engine, Excel semantics.**
   - `addWorkingDays(d, n)` = `WORKDAY(d, n, Hols)`.
   - `workingDaysBetween(a, b)` = `MAX(0, NETWORKDAYS(a, b, Hols) − 1)`.
   - Every due date and day count uses these two functions and the shared `PublicHoliday` table. Nothing else may count working days.

3. **(Registry) Timestamps where time matters; date-only everywhere else.**
   - Two fields are full timestamps: `receivedAt` (needed for the 17:00 cut-off) and file movement `outAt`. Store them as UTC and interpret them in Africa/Lagos.
   - All other business dates are date-only: deemed receipt, document date, forwarded, dispatched, delivered, closed, returned and due dates.
   - "Today" always means today in Lagos, never the server's date.

4. **Money as integers in kobo.** The only money field is "amount shown" on the inward item. Format it as ₦ in the UI only.

5. **Every state change is a server action** that:
   1. checks the user's role,
   2. validates with Zod (including date order: no closing before receipt, no delivery before dispatch, no return before issue, no future receipt dates),
   3. runs in a database transaction with a row lock on the item,
   4. writes an audit entry in the same transaction.

6. **Permissions are enforced on the server.** Hiding buttons is cosmetic only. Permission rules are pure, tested functions. Unit officers can only read items routed to their unit, and every query filters by unit, not just the page.

7. **Separation of duties, scaled to a registry.** There is no payment or approval chain, so maker-checker applies at two points:
   - **Voiding** an item: only the Head of Registry can void, and never an item they logged themselves. This is a setting, in case the team is too small.
   - **Daily Register sign-off**: the Head of Registry signs off; the officer who logged the items cannot.

8. **(Registry) Reference numbers come from database counters, never from row position.**
   - The counter table is keyed by series and year. A number is assigned inside the insert transaction, is consecutive, and is never reused or changed.
   - The serial restarts every year. For ACK numbers the year comes from the deemed receipt date; for OUT numbers it comes from the document date.
   - Prefixes are settings.
   - This replaces the workbook's `COUNTIF`-by-row numbering and "paste value to lock" step, which renumbered rows whenever an entry was cleared.

9. **Database-level protections.**
   - The audit log is append-only.
   - Inward and outward items can't be deleted; they are voided instead.
   - Issued numbers can't be updated (enforced with a trigger or check).
   - There is a single Settings row.

10. **(Registry) Snapshot the rules on save.** When an inward item is saved, store on it:
    - the type's category, Order reference, default unit, response target days and para 10(3) slip wording,
    - the closing time that applied,
    - the resulting deemed receipt date.

    Do the same for outward items: snapshot the type's response-expected flag and response window. Later edits to the types list or settings must never rewrite history.

    Due dates are then recalculated from the snapshotted target days and the current holiday table, so a newly declared public holiday moves open deadlines.

11. **(Registry) Status is derived, never stored as truth.**
    - Inward, outward and file-movement statuses are computed from stored facts and Lagos "today", in the order set out in SPEC §4.3, §5.3 and §6.2.
    - If a cached status column is needed for fast filtering, it is recalculated on every write and by a nightly job.

12. **(Registry) Links are foreign keys, one-to-many.**
    - Fields like "In reply to", "In response to our ref." and "File reference" are chosen from a searchable picker, not typed.
    - Every linked item is shown, not just the first match.
    - Only outgoing types marked `closesInwardItem` close an inward item, so a holding reply leaves it open.

13. **Undecided policy as settings**, with defaults matching the workbook. These include:
    - the 17:00 cut-off and which receipt modes it applies to,
    - whether the registration deadline rolls forward to the next working day,
    - response targets per type,
    - which types get the registration sentence on the slip.

    Every settings change is audited with old and new values.

14. **Workflow gates list every blocking reason on screen, and the server re-checks them.** For example, "Delivered today" is blocked until dispatch is recorded, and issuing a file that's still out needs explicit confirmation.

15. **Reference data is seeded from `seed-data.json`.** This covers 32 incoming types, 23 outgoing types, 30 units in 5 divisions (with their email addresses), signatories, file class codes, LGAs, lists, settings and holidays (seed-data v2). The seed only adds missing rows, so re-running it never overwrites admin edits. The workbook's example rows are seeded in dev and test only.

16. **Dev-only test clock.** Setting `APP_NOW=2026-12-10T09:00` (Lagos time) drives every "now" and "today" calculation, so cut-offs and overdue rules can be tested without waiting. The app refuses to start in production if it's set.

17. **Forms keep entered values after a validation error**, and the error message lists every missing field, matching the workbook's "Please complete:" message.

18. **Login throttling** with a temporary lockout, audited, and an admin can unlock. No permanent lockout.

19. **Imports from the workbook.** Anything logged in the workbook during the parallel run can be imported with a dry-run mode. Imports keep their original ACK and OUT numbers, advance the counters past them, never create duplicates, and are marked as imported in the audit log.

20. **Corrections, not deletions.** A wrong entry is voided with a reason, and the original stays visible. A corrected receipt time that changes the deemed year keeps its number and gets a flag.

---

## Project docs

```
CLAUDE.md          # stack, rules, build phases (Claude Code reads it automatically)
STACK.md           # this file
docs/SPEC.md       # every rule from the workbook's formulas and VBA, Excel problems to fix, test fixtures
docs/TEMPLATES.md  # acknowledgement slip, Daily Register, Pending Actions, on-screen messages
seed-data.json     # types, units, LGAs, lists, settings, holidays extracted from the workbook
assets/            # OGSERC logo
reference/         # original .xlsm and extracted VBA, for cross-checking only
```

## Build phases

Stop for review after each. Full "done when" criteria are in `CLAUDE.md`.

| # | Phase |
|---|---|
| 0 | Scaffold: framework, Prisma, lint, test tools; Phase 0 report |
| 1 | Domain engine + tests (every SPEC §12 fixture passes) |
| 2 | Data model, migrations, seed, number counters, audit log |
| 3 | Auth, users, roles, admin (users, settings) |
| 4 | Inward and outward workflows: Registry Desk, forms, registers, update actions, void |
| 5 | PDFs: acknowledgement slip, Daily Register, Pending Actions |
| 6 | File Desk: File Index, movements, issue and return |
| 7 | Dashboard, scheduled jobs, audit log viewer, CSV exports, workbook import (optional: scanned letters) |
| 8 | Hardening and deployment: admin lists/holidays, backups, user guide, parallel run |

## Workflow tips

- The rules are already extracted into `docs/SPEC.md`. Build against the spec, not the workbook.
- One phase, or one or two related changes, per prompt, each with tests.
- After each phase, test by hand per role:
  - Can a unit officer see another unit's items by typing the URL directly?
  - Can a registry officer void an item?
  - Do the dashboard tiles match their filtered lists?
- Test the time-sensitive cases with `APP_NOW`:
  - 16:59 versus 17:00 emails
  - Christmas week (25 and 28 Dec 2026)
  - 31 Dec emails rolling into the 2027 series
- Keep the "fix, don't copy" list (SPEC §9) in view. The workbook's holding-reply, first-match and slip-footer behaviours are deliberately changed.
- When the workbook changes, diff its formulas and VBA, then turn the differences into a change prompt.
- Before go-live: run user acceptance testing with registry staff, run the app alongside the workbook for a week comparing daily counts, and write a handover doc.

---

## Exact versions

Node.js 22.14 (minimum 22.12), PostgreSQL 18.4 (embedded, local). Output of `npm ls --depth=0` after Phase 0:

```
@date-fns/tz@1.5.0
@node-rs/argon2@2.2.2
@playwright/test@1.64.1
@prisma/adapter-pg@7.10.1
@prisma/client@7.10.1
@tailwindcss/turbopack@4.3.3
@types/node@22.20.5
@types/pg@8.23.1
@types/react-dom@19.3.0
@types/react@19.3.0
@vitest/coverage-v8@5.0.5
better-auth@1.7.13
date-fns@4.4.0
dotenv@18.0.9
embedded-postgres@18.4.0-beta.17
eslint-config-next@16.4.3
eslint-config-prettier@10.1.8
eslint@9.39.5
next@16.4.3
pdf-lib@1.17.1
pg@8.23.1
prettier-plugin-tailwindcss@0.8.1
prettier@3.9.10
prisma@7.10.1
react-dom@19.3.0
react@19.3.0
recharts@3.10.1
tailwindcss@4.3.3
tsx@4.23.15
typescript@5.9.3
vitest@5.0.5
zod@4.6.7
```
