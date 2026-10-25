# Phase 1 report

Branch `phase-1` (stacked on `phase-0`). The domain engine is in `src/domain/`: pure functions only, with `now`/`today` always passed in.

## 1. What's built

| Module | Covers |
|---|---|
| `calendar.ts` | `isWorkingDay`, `addWorkingDays` (= `WORKDAY`), `workingDaysBetween` (= `MAX(0, NETWORKDAYS − 1)`), on `"YYYY-MM-DD"` dates |
| `clock.ts` | Lagos "today", time of day and date of an instant; build an instant from a Lagos date + time |
| `receipt.ts` | Deemed receipt date (§2.1), registration deadline with the rollover setting (§2.2) |
| `numbering.ts` | `OGSERC/ACK/2026/00001` format/parse, year rules, slip file name (§3.1, §7) |
| `inward.ts` | Derived fields, status order, flags, duplicate-CAC finder (§4.2–§4.4) |
| `outward.ts` | Derived fields, status order, flags (§5.2–§5.4) |
| `files.ts` | Movement return due / status, "currently with", file flags, latest unreturned movement (§6) |
| `dashboard.ts` | The §8.4 counters, with one definition of "pending" (R12). Breakdowns come in Phase 7. |

## 2. Fixtures

`npm test`: 80 tests pass. Domain coverage is about 98% of lines.

- **§12.1:** D1–D13 all pass.
- **§12.2:** I1–I3, O1–O2, F1–F2 pass, including the 16 Dec and 11 Dec variants. The 10 Dec dashboard figures also pass. The scenario is in `tests/fixtures/workbook-example.ts`.
- **§12.3:** N1, N2 and N5 pass. N3 (concurrency) and N4 (void) need the database; they are Phase 2 integration tests.

Every rule the scenario doesn't exercise has its own test in `src/domain/rules.test.ts`.

## 3. Decisions to check before Phase 2

These change the Phase 0 model proposal:

1. **Rules don't match on names.** The domain never compares a label.
   - Incoming types get two booleans: `isRegistration` (REG-01 checks) and `requiresRelatedOgsercNo` (Update, Annual confirmation, Deficiency response).
   - Action required, priority, ack-via and file status values carry system keys (`FOR_INFORMATION`, `URGENT`, `NOT_YET_ISSUED`, `CLOSED`, …).
   - Receipt modes are matched by id against the two settings lists.
2. **Schedule 2 counts are settings:** `schedule2RequiredDocs` (12) and `schedule2RequiredDocsMultiState` (13). The multi-State check only runs if the optional tick is recorded (Q-E).
3. **`IncomingType.orderRef` is nullable.** 18 seed types have none.
4. **Voided items carry no flags.** They are excluded from every dashboard count except "voided".
5. **Tie-breaks:** when two replies were dispatched on the same day, or two responses share a deemed date, the lower number counts.
6. **CAC duplicate check** ignores case and surrounding spaces. Excel ignores case only.

## 4. Spec questions found while building

- **"Not forwarded within target" on closed items.** An item closed by a reply, or closed manually, but never forwarded keeps this flag. Its working-days-at-registry also keeps growing, because it counts to today. That's the literal spec/Excel rule; "Close today" avoids it by setting the forwarded date. Should the flag stop once the item is closed?

The Phase 0 open questions (Q1–Q8, Q-A–Q-E) still stand. None blocks Phase 2 except Q-E, which only affects whether `multiState` becomes a form field.
