# Phase 0 report

Branch `phase-0`. Scaffold done; nothing in `src/domain` yet (that's Phase 1).

## 1. What's set up

| Item | State |
|---|---|
| Next.js 16.4.3 (App Router, Cache Components on), React 19.3, TypeScript 5.9 strict, Tailwind 4.3 | `npm run dev` serves the placeholder home page |
| Prisma 7.10.1 + `@prisma/adapter-pg`, `prisma.config.ts`, client generated to `src/generated/prisma` on `npm install` | Connects to the local DB; no models yet |
| Local PostgreSQL 18.4 via `embedded-postgres` (no Docker on this machine) | `npm run db` (5443), `db:test` (5444), `db:e2e` (5445) |
| Vitest 5 (runs under `TZ=UTC`) | `npm test`: seed-data sanity tests pass (5/5) |
| Playwright 1.64 (Chromium) | `npm run test:e2e`: smoke test passes |
| ESLint 9 + Prettier 3 | `npm run lint` clean; extra rule blocks DB imports, `Date.now()` and `new Date()` in `src/domain` |
| Installed for later phases | Better Auth 1.7, `@node-rs/argon2`, Zod 4, date-fns 4 + `@date-fns/tz`, pdf-lib, Recharts 3 |
| `.env.example` | Every variable: DB URLs ×3, Better Auth secret/URL, `CRON_SECRET`, `APP_NOW` |

Choices worth checking:
- **Prisma 7.10.1, not 8.** npm's `latest` tag currently points to `8.0.0-rc.27`, a release candidate. I pinned the last stable release.
- **Ports 5443–5445** for local databases, so they never clash with a PostgreSQL already on 5432.
- **System fonts** instead of Google-hosted fonts, so builds work without internet access.
- Brand colours are **placeholder tokens** in `src/app/globals.css` (see §6 Q-B).

Where CLAUDE.md and STACK.md differ, I'm following STACK.md:
- **Auth:** Better Auth, not Auth.js.
- **Amounts:** stored as integer kobo, not "decimal".
- **Phase 7 scope:** also covers scheduled jobs, the audit log viewer and the workbook import.
- **Added:** the `APP_NOW` dev clock.
- **CSV export:** stays in Phase 4, where CLAUDE.md puts it.

## 2. Proposed Prisma models (Phase 2)

Conventions:
- Business dates are `@db.Date`, and the domain layer handles them as `"YYYY-MM-DD"` strings. Only `receivedAt` and `outAt` are `timestamptz`.
- Every row has `createdAt` / `createdById` / `updatedAt`.

**Reference data**
- `Unit`: name (unique), active.
- `IncomingType`: name, category, defaultUnit → Unit, orderRef, responseTargetDays, para103SlipWording, **slipFooter** (`REGISTRATION` | `PARA103` | `GENERAL`, for Q4), active.
- `OutgoingType`: name, responseExpected, responseWindowDays, closesInwardItem, active.
- `ListItem`: list (`RECEIPT_MODE`, `LGA`, `ACK_VIA`, `PARTY_CATEGORY`, `ACTION_REQUIRED`, `PRIORITY`, `FILE_CLASS`, `FILE_SECURITY`, `FILE_STATUS`), label, sortOrder, active, plus an optional **systemKey**. Values the rules depend on carry a systemKey. These are: Email, Online portal, For information, File only, Urgent, Not yet issued, Normal, Confidential, Personnel, Closed, Archived, Publication / gazette, Internal mail. Admins can rename those values but not delete them, so a rename never breaks a rule.
- `PublicHoliday`: date (unique), name, status (`FIXED` | `PROVISIONAL` | `ESTIMATED`), note. The seed's "— confirm FG declaration" text moves into `note`.
- `RegistrySettings`: one row (id = 1). It holds every key in seed `settings`, plus:
  - `deadlineRollsToNextWorkingDay` (default false)
  - the three slip footer texts
  - `secretaryName`
  - `headMayVoidOwnItems` (default false, per STACK rule 7)
  - afterHours / noDeliveryConfirmation modes as arrays of ListItem ids

**Registers**
- `NumberCounter`: (series `ACK` | `OUT`, year) primary key, lastValue.
- `InwardItem`:
  - **Number:** number (unique), numberYear, serial. A DB trigger blocks changes to these.
  - **Inputs:** every SPEC §4.1 input field. Lists are FKs to ListItem and links are FKs. `amountShownKobo` is BigInt. `multiState` is optional (see Q-E).
  - **Handling:** dateForwarded, receivedByUnitOfficer, dateClosedManual, closingNote.
  - **Snapshot on save** (STACK rule 10): category, orderRef, default unit, target days, para103 wording, footer kind, closing time, deemedReceiptDate.
  - **Cached, recomputed on every write and nightly:** `routedUnitId` (the unit filter for permissions) and `statusCache`.
  - **Void and import:** voidedAt / voidedById / voidReason, `imported`.
- `OutwardItem`:
  - **Number:** as inward.
  - **Inputs:** every SPEC §5.1 field. `signedBy` → User (signatories), with a free-text designation.
  - **Delivery:** deliveryConfirmed, dateDelivered, receivedByRecipient.
  - **Snapshot:** responseExpected, responseWindowDays.
  - **Void and import:** as inward.
- `RegistryFile`: every SPEC §6.1 field; reference is unique.
- `FileMovement`: every SPEC §6.2 field.
  - `issuedTo` is text, with an optional link to a User.
  - `issuedWhileOut` drives the "Earlier movement … not returned" flag.

**System**
- `User`, `Session`, `Account`, `Verification`: Better Auth tables. User adds role, unitId (unit officers), isSignatory, designation, active, and lockout fields (failedLogins, lockedUntil).
- `AuditLog`: at, userId, action, entityType, entityId, before/after JSON. Append-only, enforced by a trigger that rejects UPDATE and DELETE.
- `DailyRegisterSignOff`: date, signedById, signedAt. Only if Q-C says sign-off happens in the app.
- `JobRun`: job, startedAt, finishedAt, result (Phase 7).

## 3. Route map

| Route | Purpose | Phase |
|---|---|---|
| `/login` | Email + password | 3 |
| `/` | Registry Desk: tiles + action buttons | 4 |
| `/inward/new`, `/outward/new` | New Inward (Save / Save + print slip / Save + PDF slip), New Outward (Save & get number) | 4, 5 |
| `/inward`, `/outward` | Registers: filters, sort, search, colour key | 4 |
| `/inward/export`, `/outward/export` | CSV with the on-screen filters (route handlers) | 4 |
| `/inward/[id]`, `/outward/[id]` | Detail + update, one-click actions, void, linked items, audit history | 4 |
| `/inward/[id]/slip` | Acknowledgement slip PDF | 5 |
| `/daily` (+ `/daily/pdf?date=`) | Daily Register | 5 |
| `/pending` (+ `/pending/pdf?unit=`) | Pending Actions | 5 |
| `/files`, `/files/new`, `/files/[id]` | File Index, file detail with movements, issue / return | 6 |
| `/dashboard` | Dashboard + breakdowns | 7 |
| `/admin/users`, `/admin/settings` | Admin only | 3 |
| `/admin/types`, `/admin/lists`, `/admin/holidays` | Head of Registry | 8 |
| `/admin/audit` | Audit log viewer | 7 |
| `/api/auth/[...all]` | Better Auth handler | 3 |
| `/api/jobs/[job]` | Cron entry point (needs `CRON_SECRET`) + "Run now" | 7 |

## 4. Fixture check against seed-data.json

I worked through every SPEC §12.1 and §12.2 figure by hand against the seed values. They all agree: target days (REG-01 20, Deficiency response 10, NERC letter 10), forwarding target 2, chase-after 5, file return 3, and holidays 25/26/28 Dec and 1 Jan. Two gaps in the fixtures, where I'll assume the following unless you say otherwise:
- **O1's file isn't stated.** F1 expects "outward 1", so O1 goes on `OGSERC/RL/001`. O2 goes on `OGSERC/GOV/001`.
- **N1 and N4 change I2.** N1 closes it and N4 voids it, so each runs as its own scenario on top of the §12.2 base. The 10 Dec dashboard figures are checked against the base only.

## 5. Spec points that are ambiguous or that I'd change

1. **Unit officer visibility (§10).** "Pending and closed items" leaves out Noted / filed. **Proposal:** every non-void item routed to their unit.
2. **Confidential / Personnel files (§10).** Registry officers can't see these files. Are the letters linked to them hidden too? **Proposal:** letters stay visible, and only the file record and its movements are hidden.
3. **Head of Registry "edit any field".** Changing `receivedAt` or the type changes the deemed date and the snapshot. **Proposal:** allowed with a reason and audited. A type change re-snapshots from the current type. The number never changes; the year-differs flag covers the deemed-date case.
4. **"For information" / "File only" items** show as Awaiting forwarding, and count as pending, until someone forwards them (§4.3 order). That's the Excel behaviour, so I'll keep it unless you say otherwise.
5. **Para 25 extension (§2.2).** "Entered manually as an override date", but the spec doesn't say on what. **Proposal:** an optional `registrationDeadlineOverride` on REG-01 inward items, used for the "filed after deadline" check.
6. **Outward `responseDueOverride` is ignored until the letter is dispatched** (§5.2, Excel behaviour). I'll keep it.
7. **"Currently with" when the movement has no unit:** show the name only, without "()".
8. **Holidays.** The seed covers 2026–27 only. Phase 8 adds the 30-day estimated-holiday warning; someone needs to load 2028 holidays before the end of 2027.

## 6. Open questions

None of these block Phase 1: the domain engine uses the Excel defaults, and each rule is a setting.

From SPEC §11 (default shown in brackets):
- **Q1** Does the registration deadline roll forward when it falls on a non-working day? And what is the gazetted Effective Date? *(No rollover; 2 Nov 2026 placeholder → deadline 1 Jan 2027)*
- **Q2** Should the ACK serial restart every year, or run as one sequence? *(Yearly restart)*
- **Q3** Does the 17:00 cut-off apply only to email and online portal, or also to hand delivery and courier? *(Email and portal only)*
- **Q4** Which types get the registration sentence on the slip footer? *(REG-01, OUN-01, Deficiency response, Licence / permit application, Licence renewal application)*
- **Q5** Do unit officers record anything themselves, or is v1 read-only for them? *(Read-only)*
- **Q6** Response target days per type: confirm the seed values as Commission policy. *(Seed values)*
- **Q7** The real staff list, the Secretary's name, and who holds each role. Not needed until Phase 3; dev uses placeholder users.
- **Q8** Should scanned letters be uploaded and stored? If so, what size limit and retention period? *(Not built unless you confirm)*

SPEC §3.3: nothing to decide. The prefix is a setting and numbering goes through the single `nextNumber(series, year, tx)` function, as you settled on 23 Oct.

New:
- **Q-A Logo:** `assets/` is empty. Please add the OGSERC logo (PNG or SVG). Needed by Phase 5.
- **Q-B Brand colours:** the official green and gold hex codes. Needed by Phase 4.
- **Q-C Daily Register sign-off (STACK rule 7):** should the Head of Registry sign off in the app (recorded and audited, and blocked for the officer who logged the items)? Or is it only the printed signature lines in TEMPLATES §2?
- **Q-D Voiding your own items:** STACK says the Head of Registry may not void an item they logged themselves. Should that be on (my default) or off for a small team?
- **Q-E Multi-State checkbox** for REG-01 (SPEC §4.4: 13 Schedule 2 documents instead of 12). Should it be added?
