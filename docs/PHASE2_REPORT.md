# Phase 2 report

Branch `phase-2` (stacked on `phase-1`). Data model, migrations, seed and number service.

## 1. What's built

| Area | Where |
|---|---|
| Schema: SPEC §1 entities, settings row, holidays, number counters, voids, audit log, a minimal `User` | `prisma/schema.prisma` |
| Migrations, plus hand-written protections (below) | `prisma/migrations/` |
| Number service `nextNumber(series, year, tx)`, prefix from settings | `src/server/numbers.ts` |
| Audit writer (same transaction as the change) | `src/server/audit.ts` |
| Rules and holidays loaded from the DB into the domain's `RuleContext` | `src/server/rules.ts` |
| DB rows → domain facts | `src/server/facts.ts` |
| Create inward/outward (number, snapshot, deemed date, routing, status cache, audit) and void | `src/server/registers.ts` |
| Dashboard loading path (counts; breakdowns in Phase 7) | `src/server/dashboard.ts` |
| `APP_NOW` dev clock, refused in production | `src/server/clock.ts` |
| Reference seed and dev/test-only §12.2 example | `prisma/seed.ts`, `prisma/seed/` |

**Database protections.** Each is proven by a test:
- Inward and outward items can't be deleted.
- Numbers can't be changed.
- A void needs a time, a user and a non-blank reason, and can't be undone.
- Counters only move forward and can't be deleted.
- The audit log is append-only.
- There is exactly one settings row, and it can't be deleted.

## 2. Tests

`npm test`: 97 tests pass (80 unit, 17 integration).

- **N3:** 20 concurrent saves get 00001–00020, with no gaps and no duplicates.
- **A failed save gives its number back.** The counter rolls back with the transaction.
- **N4:** the voided number is kept and excluded from counts. O1 goes back to overdue, and the next item is 00004.
- **§12.2 through the DB:** the seeded example has the right numbers and cached statuses, and the 10 Dec dashboard matches.

The integration tests start their own local test database if none is running, so a fresh clone needs no extra step. They refuse anything that isn't a local `*_test` database.

## 3. Decisions to check

These differ from the Phase 0 proposal:

1. **Receipt-mode rules are flags on the list values**, not id arrays in settings: `afterHoursCutoff` (Q3) and `noDeliveryConfirmation`. Admins tick them per mode, and a foreign key can't dangle.
2. **Outward items also snapshot `closesInwardItem`.** If an admin later changes a type, closed inward items don't reopen (STACK rule 10).
3. **The seed fills empty tables only.** Matching rows by name would bring back any value an admin had renamed or deleted. The trade-off: new values added to `seed-data.json` later (e.g. 2028 holidays) are entered through the admin screens (Phase 8), not by re-seeding.
4. **Voids are columns on the item** (`voidedAt`, `voidedById`, `voidReason`), not a separate table. The audit log keeps the history.
5. **Slip footers are settings**, with a `{closingTime}` placeholder, so Legal can edit them without a deploy (TEMPLATES §1). Q4's five types get the registration footer.
6. **Outward `signedById` is optional**, only so that workbook imports can keep a typed signatory in `signedByText`. The Phase 4 form will require a signatory user.

## 4. Left for later phases

- **Phase 3:** who may void, including the `headMayVoidOwnItems` setting (default off, Q-D); Better Auth tables; lockout.
- **Phase 4:** form validation (R10 date order, required fields with "Please complete:"); update actions.
- **Phase 7:** nightly recompute of the cached status column. It is already refreshed on every write.

One fix found by the tests: the init migration's void check let a missing reason through, because SQL treats `btrim(NULL) <> ''` as NULL and a CHECK passes on NULL. A second migration corrects it.
