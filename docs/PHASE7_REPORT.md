# Phase 7 report

Branch `phase-7` (stacked on `phase-6`). Dashboard, scheduled jobs, audit log viewer and workbook import. Scanned-letter uploads are not built (Q8 unanswered).

## 1. What's built

| Area | Where | Notes |
|---|---|---|
| Dashboard | `/dashboard` (registry officers, Head of Registry, Secretary) | Every SPEC §8.4 counter as a tile, linked to the matching filtered register; two charts; every breakdown table |
| Charts | Items by month; pending inward items by unit | Recharts, one axis each, hover readouts, "Show as table". The two-series colours (blue / orange) pass the colour-blind checks. The month chart stops at this month (or the latest item), so it never plots an empty future |
| Breakdowns | By unit, incoming category, correspondent (in / out), incoming type, outgoing type, principal LGA, month | "Pending" means Open + Overdue + Awaiting forwarding in every table (R12) |
| Scheduled jobs | `/admin/jobs` (Admin), `POST /api/jobs/<job>` | `refresh-status` recomputes every cached status (R6), and `holiday-check` lists estimated/provisional holidays in the next 30 days. The cron caller sends `Authorization: Bearer $CRON_SECRET` and is refused if the secret isn't set. Every run is recorded |
| Holiday warning | Registry Desk (Head of Registry, Admin) | Unconfirmed holidays in the next 30 days |
| Audit log viewer | `/admin/audit` (Head of Registry, Admin: new `audit.view`) | Filter by number or file, record type, action, user, dates; ids shown as names |
| Workbook import | `npm run import:workbook -- --file <xlsm> --as <head email> [--commit]` | See below |

### Workbook import (STACK rule 19)

- **Dry run by default:** the whole import runs and is rolled back, so the report shows exactly what `--commit` would do. `--commit` saves only if there are no errors.
- **Numbers:** keeps the workbook's ACK/OUT numbers and moves the counters past them, so new items continue from there.
- **Links:** "In reply to", "In response to our ref." and file references become proper links. Statuses are worked out as in the app.
- **Officer names:** typed officer names that match no user (e.g. the placeholder "Registry Officer") are recorded as the importing Head of Registry. Each one is listed as a warning and noted in the item's remarks.
- **Deemed dates:** if the app's deemed receipt date differs from the workbook's (holidays, cut-off), it's listed as a warning.
- **Never duplicates:** numbers and file references already in the app are skipped. A movement of the same file, to the same person, on the same day counts as the same movement.
- **Examples:** rows marked "EXAMPLE" are skipped unless `--include-examples`.
- **Audit:** every imported record is audited as "import" and flagged as imported.

## 2. Done-when

**The dashboard on 10 Dec 2026 matches SPEC §12.2**, checked in a browser on the scenario entered through the UI:

| Figure | Shown |
|---|---|
| inward logged | 3 |
| awaiting forwarding | 1 |
| closed | 2 |
| closed on time | 100% |
| received after hours / non-working day | 1 |
| outward logged | 2 |
| responses received | 1 |
| replies to inward items | 2 |
| files out | 1 |
| files overdue | 1 |

The same figures and the breakdowns are also checked in integration tests on the seeded example.

`npm test`: 219 pass. `npm run test:e2e`: 14 pass.

## 3. Decisions to check

1. **Staying on the to-do list:**
   - The **backup check job** moves to Phase 8, which sets up backups.
   - The **morning overdue summary** (optional in STACK) isn't built: there's no email set up. Say if you want it, and how it should be sent.
2. **Who sees what:**
   - The **dashboard** is for registry officers, the Head of Registry and Secretary/management. Unit officers aren't included (SPEC §10 doesn't give them the dashboard).
   - The **audit log** is for the Head of Registry and Admin.
3. **The importer works from a file on the server** (a command, not a web upload), so the workbook never travels over the web.
4. **The holiday warning on the Desk** stands in until Phase 8's holiday screen.

## 4. Things I fixed along the way

- **Monthly chart:** it first plotted all 24 months, mostly an empty future. It now stops at the current month.
- **Chart labels:** the two end-of-line labels overlapped when both lines ended at the same value.
- **Import duplicates:** matching movements on their exact time would have duplicated a movement typed into both places at slightly different times. Movements now match on file, day and holder.
