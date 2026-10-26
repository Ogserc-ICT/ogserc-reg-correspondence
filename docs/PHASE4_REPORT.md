# Phase 4 report

Branch `phase-4` (stacked on `phase-3`). Inward and outward workflows.

## 1. What's built

| Screen | Route | Notes |
|---|---|---|
| Registry Desk | `/` | The 7 tiles from SPEC §8.4, counted within the user's scope; New inward / New outward buttons |
| New Inward | `/inward/new` | All §4.1 fields, defaults (now, me, Printed slip, Normal), searchable pickers for "In response to our ref." and File, Clear form (asks first if anything was typed) |
| New Outward | `/outward/new` | All §5.1 fields; signatory defaults to the Secretary to the Commission; the number is shown large after saving ("Quote it on the document") |
| Inward / Outward registers | `/inward`, `/outward` | Filters (search, status incl. "Pending", unit, type, dates, flagged only), sortable columns, paging, colour key, CSV export with the same filters |
| Item pages | `/inward/[id]`, `/outward/[id]` | Every field, derived values and flags; Forwarded / Close / Dispatched / Delivered today; Update Item; Head of Registry full edit (with a reason) and Void; all linked items; readable audit history |
| CSV | `/inward/export`, `/outward/export` | Excel-safe (UTF-8 BOM, formula cells defused) |

**Server**
- `src/server/workflows/`: create, update and the one-click actions. Each one:
  1. checks the user's capability,
  2. locks the row,
  3. validates,
  4. writes an audit entry with the before/after of changed fields,
  5. refreshes the linked items' status.
- `src/server/read/`: registers, item detail, pickers, CSV, form options and defaults.

**Messages:** the TEMPLATES §4 wording, e.g. `Saved as {no}. Forward to: {unit}.`, `Outward number: {no}. Quote it on the document.`, `Close {no} today without an outgoing letter?`, `Record the dispatch first (DISPATCHED TODAY).`, and "Please complete:" followed by every missing field.

## 2. Tests

- `npm test`: 168 pass (domain, workflows, read side, CSV, auth, numbering).
- `npm run test:e2e`: 8 pass.

**Done-when, in a browser:** `e2e/scenario.spec.ts` signs in as a registry officer and enters I1, O1, I2, I3 and O2 through the screens. The app clock is 10 Dec 2026, and only the two files exist beforehand. It then checks on screen every value §12.2 gives:
- **Dates:** deemed dates and response due dates.
- **Routing:** units, categories and Order references.
- **Closing:** who closed what and when, and "closed on time".
- **Counts and flags:** working days at Registry and open, flags, O1's response, O2's days to dispatch.
- **Desk:** the Desk tiles.

The 16 Dec and 11 Dec variants and N1 are covered by integration tests. The app clock can't move mid-run.

## 3. Decisions to check

1. **Registers work out status live** for every row from today's date, so they're never a day stale. The cached status column is still kept up to date on every write, for later use. This is fine for tens of thousands of items; if it ever gets slow, filter on the cache refreshed nightly (Phase 7).
2. **Future dates are blocked** for forwarded, closed and letter dates as well as for receipt, dispatch and delivery (R10 lists only the last three).
3. **"Forwarded / closed before receipt"** compares with the actual receipt date, not the deemed date. An email at 18:40 on 30 Nov can be forwarded on 30 Nov.
4. **Head of Registry full edit:**
   - A reason is required, and it goes in the audit log.
   - A new receipt time or mode recalculates the deemed date; a new type re-snapshots that type's rules.
   - The number never changes; the "number year differs" flag covers the 31 Dec case.
5. **Officers only change handling fields.** Any other field sent to the server is ignored (the form doesn't show it).
6. **A closed item can't be closed again.** Clearing "date closed" in Update Item reopens it, and the reopening is audited.
7. **Priority:** blank means Normal, so the list offers Urgent / High / Low plus a blank "Normal".

## 4. Fixed along the way

- **Phase 3 bug:** registry officers couldn't see any ordinary files. The Confidential/Personnel filter used `NOT (systemKey = …)`, which SQL treats as NULL for list values without a key. It's now written so a missing key doesn't hide anything, and a regression test covers it.
- **E2E dev server:** e2e now builds into `.next-e2e`, so it runs even while you have `npm run dev` open (Next allows one dev server per build folder).

## 5. Not in this phase

- **Phase 5:** "Save + print slip" / "Save + PDF slip".
- **Q-B:** brand colours are still placeholders.
- **Known warning:** Prisma 7 issues concurrent queries inside transactions, so pg prints a deprecation warning. It's harmless on pg 8; revisit before pg 9.
