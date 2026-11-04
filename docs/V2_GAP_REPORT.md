# Registry v2: gap report (Phase V0)

> **Status:** every C-section is built (phases V1–V8), and both open points are decided:
> - Q-V2-2: the re-routing notice is built with the agreed wording, behind its setting (default off, as the workbook). It goes only to addresses that actually received the acknowledgement, and not to those the new unit's email reaches anyway.
> - C13.1: file references stay on the Routing Desk (C4, C5.2). An unrouted item has none; the desk suggests the file of the letter an item answers. The example's RL/001 shows 1 inward item through the screens.

What the app does today compared with `docs/SPEC-v2-CHANGES.md` (C1–C13), and what each phase V1–V8 will change. No code changed in V0.

Sources read: `CLAUDE.md`, `docs/STACK.md`, `docs/SPEC.md`, `docs/SPEC-v2-CHANGES.md`, `seed-data.json` (v2), and `reference/vba/RegistryDesk.v2.bas` where the delta was unclear (email, routing, front desk pull, file reference generator).

---

## 1. Decisions already made

| Ref | Decision |
|---|---|
| Q-V2-1 Email provider | Not decided. Build a `MailTransport` interface plus a dev transport that writes each email to a file or log. `ackEmailMode` defaults to **Off** until a real provider is set up. Review and Send must still work end to end against the dev transport, with tests. |
| Q-V2-2 Notify the first unit on re-route | No (workbook behaviour). This becomes a setting, `notifyPreviousUnitOnReroute = false`. |
| Q-V2-3 Password re-entry for routing | No. This becomes a setting, `routingRequiresPassword = false`. |
| Q-V2-4 Unit migration | The C1.1 map is confirmed as written, including the rows marked "confirm". |
| Q-V2-5 Front desk modes | Any receipt mode (workbook behaviour). |
| Q-V2-6 Email addresses | To be supplied after the build. They are seeded blank. A missing address never blocks saving or routing; the app shows the "not emailed: no email address" line. Admin › Units gets a screen to fill them in. |
| C2 broken default units | "Licensee returns / performance report" goes to **Performance Monitoring unit**. "Incident / outage report" goes to **Occupational Health, Safety and Performance Analysis unit**. Both stay admin-editable and are listed in `docs/GO_LIVE_CHECKLIST.md`. |

The answers to the ambiguities raised in this report (below) were accepted as proposed on review. Each section shows the agreed answer.

## 2. What the databases hold, and the upgrade plan

- **Local dev and test databases:** seeded dev/test data only. They are **dropped and reseeded** from the v2 seed.
- **Production (Neon, behind the vercel.app site):** reference data and user accounts only. It holds no real inward items, outward items, files or movements. Two things make a reseed alone unusable there. `db:seed` only fills *empty* tables, so it would never pick up v2. Dropping the database would also lose the accounts. Production therefore gets a one-off script, **`scripts/upgrade-reference-v2.ts`**, which:
  - runs in a **single transaction**: all of it applies, or none of it;
  - with `--dry-run`, prints a full before/after report and changes nothing. That report covers every unit, division, type, user unit, list, setting and signatory;
  - refuses `--commit` unless `--confirm` is also passed, which confirms that the dry run was reviewed;
  - adds the 5 divisions and 30 units (with unit group and emails);
  - applies the C1.1 map to every row that points at an old unit: `User.unitId`, `IncomingType.defaultUnitId`, and any item, file or movement rows if they exist (none are expected);
  - deactivates the 10 old units but does not delete them;
  - renames "Consumer petition / public representation" to "Consumer petition", adds "Public representation", and re-points every type's default unit;
  - adds the file class codes and the signatory list, and sets `ackEmailMode = Off`;
  - is idempotent (a second run changes nothing) and audits every change as `upgrade-reference-v2`.

  The user runs it against production after a backup and a tested restore (GO_LIVE_CHECKLIST). Claude only runs it against local and test databases.

## 3. Problem found up front: the branch is red

Commit `384e559` brought the v2 `seed-data.json` onto `feat/registry-v2` without code changes, so:

- `prisma/seed/reference.ts:115` treats `units` as strings, but they are now objects.
- `prisma/seed/reference.ts:141-147` throws on the two type defaults that name no real unit.
- `prisma/seed/example.ts` (dev logins and example items) looks units up by old names, such as "Registration & Licensing" and "Office of the Chairman".
- `tests/seed-data.test.ts` expects 31 types and 10 string units.

`npm test` and `npm run db:seed` fail on this branch until V1. **The first commit of V1 restores a green suite** before any feature work.

---

## C1. Organisation: units, divisions, unit groups, emails

**Today**
- `Unit` holds only `id, name, sortOrder, active` (`prisma/schema.prisma:168`). There is no division and no email.
- Units are edited on `admin/lists` ("Lists and units"), through `saveUnitAction` in `src/app/(staff)/admin/reference-actions.ts`.
- The by-unit breakdown matches on the unit label (`src/domain/breakdowns.ts:93-104`).
- Production code has no hard-coded unit names. Tests and the dev example seed do.

**Must change**
- Migration: a new `Division` model (`name` unique, `emails String[]`, `sortOrder`, `active`). `Unit` gains `divisionId` (FK, required for active units), `unitGroup` and `emails String[]`.
- Seed the 5 divisions and 30 units. Dev and test are reseeded. Production gets `upgrade-reference-v2` (§2).
- Division is derived for items at read time, from the item's current unit (inward) or originating unit (outward). The join lives in `src/server/facts.ts` and `src/server/read/*`.
- Domain: `normaliseEmails()` trims, lower-cases, validates and dedupes.
- A new admin screen, Admin › Units & divisions: edit unit, division, group and emails, and division emails. Every change is audited. It replaces the units section of `admin/lists`.

**Risk**
- Every test and e2e spec that names old units has to change:
  - `tests/fixtures/workbook-example.ts:186,228,242`
  - `src/domain/breakdowns.test.ts`, `src/domain/slip.test.ts:30`
  - `tests/integration/workflows.test.ts:80,101,206`
  - `reports.test.ts`, `reference.test.ts`, `read.test.ts`, `files.test.ts`, `example-and-void.test.ts`, `auth.test.ts`
  - `e2e/auth.spec.ts:93`, and about 15 lines of `e2e/scenario.spec.ts`
- Production: unit officers' `unitId` values are remapped by the script. The dry-run report lists every one.

**Wrong or ambiguous**
- Division is derived at read time (C1), so moving a unit to another division also moves its history on the dashboard. Accepted as specified.

## C2. Incoming types (32)

**Today**
- 31 types. `IncomingType.defaultUnitId` is a real FK, and the seed resolves it by unit name.
- `tests/integration/reference.test.ts` already refuses to switch off a unit that types still route to.

**Must change**
- Seed 32 types. Seed validation, as a pure function `checkTypeDefaultUnits()` in `src/domain/reference-check.ts`:
  - every type's default unit must exist;
  - a `defaultUnitValid:false` type takes its confirmed replacement and is named in the seed output;
  - nothing is ever created silently.
- The same check runs at start-up as a logged warning and on Admin › Types as a banner (V13).
- Production: rename and split the consumer-petition type, then re-point defaults (script, §2).

**Risk:** low. No items exist in production.

**Wrong or ambiguous:** none beyond the two defaults, which are now decided.

## C3. Front Desk intake

**Today:** nothing. `Series` is `ACK | OUT` in `src/domain/numbering.ts:4` and in the Prisma enum, and `src/server/numbers.ts:24` chooses the prefix with a ternary.

**Must change**
- **Model:** `FrontDeskIntake` with the C3.1 fields:
  - `intakeNo` is unique;
  - `inwardItemId` is unique and nullable;
  - `InwardItem.frontDeskIntakeId` is also unique and nullable;
  - the two unique keys make double registration impossible (E8).
- **Numbering:** `Series` gains `FD`. The prefix comes from a map in `numbers.ts` plus a new `frontDeskPrefix` setting (seed `OGSERC/FD`). The year is the **calendar year of `receivedAt` in Lagos**, not the deemed year.
- **Domain:**
  - `deriveIntake()` gives the status (`Registered` or `Awaiting registry`) and `workingDaysWaiting`.
  - `intakeYear()` gives the FD number year.
  - `pullIntake()` maps an intake to form values, copying non-blank values only.
- **Server:**
  - `logIntake` (capability `frontdesk.write`).
  - `createInward` takes an optional `intakeId`. It links the intake inside the same transaction and sets `registeredAt = now`.
  - If the registry officer changes **`receivedAt` or `mode`** from the intake values, a **reason is required** and audited. Both drive para 10(3). (E7, agreed)
- **Screens:**
  - `/front-desk`: form plus the "Awaiting registry" list.
  - `/front-desk/log`: filters and CSV.
  - A "From front desk" picker on New Inward, with the replace-form confirm and the "already registered as" message.
- **Visibility (agreed):**
  - Front desk officers see the whole awaiting-registry list, plus their own intakes.
  - The full Front Desk Log is for registry staff and above.
- **E10:** the workbook's real test entry (OGSERC/FD/2026/00001, Verge Power Limited) is never seeded or imported. The importer skips the Front Desk Log sheet, and a test proves it (agreed).

**Risk:** low, because the tables are new. `createInward` gains one optional path.

**Wrong or ambiguous:** the mode-reason rule above extends C3.2, which mentions only the receipt time. Agreed on review.

## C4. New Inward: the slimmed form

**Today**
- `src/app/(staff)/inward/inward-fields.tsx` has a "Routing and file" fold-out: file, unit override, action officer, due override. Action required and priority sit under "Handling".
- `InwardItem.actionRequiredId` is NOT NULL (`schema.prisma:342`).
- The save message is `Saved as {no}. Forward to: {unit}.` (`src/server/workflows/inward.ts:428`).
- `isMissingRequired` checks action required (`src/domain/inward.ts:268`).
- `EditInwardForm` (Head of Registry, `items.editAny`) reuses `InwardFields`.

**Must change**
- Migration: `actionRequiredId` becomes nullable.
- Remove the six routing fields from the New Inward form, its Zod schema and `logInward`. The intake picker is added (C3).
- Domain:
  - "Missing required field" stops checking action.
  - `inwardResponseDue` treats a blank action as "not note-only", so the type target applies.
  - Before routing, `routedUnit` is the snapshotted default unit (the "suggested unit").
- The new three-line save message, followed by the email result line (C6).

**Risk**
- `e2e/scenario.spec.ts:101,191` fills the removed fields.
- `tests/integration/workflows.test.ts` "New Inward" asserts the old message.

**Wrong or ambiguous**
- TEMPLATES §4 `Saved as {no}. Forward to: {unit}.` is superseded. TEMPLATES gets updated in V8.
- Before routing, the slip's "Forwarded to" prints the current (suggested) unit. Kept.

## C5. Routing

**Today**
- `UpdateInwardForm` (`src/app/(staff)/inward/[id]/item-forms.tsx`) and `updateInward` (`src/server/workflows/inward.ts:452`) edit the unit override, action officer, priority, due override and file.
- `forwardToday` (`inward.ts:551`) has no confirm.
- The status cascade and `PENDING_INWARD` are in `src/domain/inward.ts:77-89,175-185`.
- Status lists are hard-coded in:
  - `prisma/schema.prisma:58` (enum)
  - `src/server/registers.ts:36-44`
  - `src/server/read/registers.ts:103-110`
  - `src/app/_components/status.tsx:6-19`
  - `src/app/(staff)/inward/page.tsx:83-95`
  - `inward/inward-timeline.tsx:25`
  - `src/server/read/reports.ts:166`, `src/server/pdf/reports.ts:227,254`
  - `src/app/(staff)/dashboard/charts.tsx:269`

**Must change**
- **Migration:**
  - `InwardStatus` gains `AWAITING_ROUTING`.
  - `InwardItem` gains `routedById`, `routedAt` and `forwardedBeforeRouting` (boolean fact).
  - New model `RoutingEvent`: item, by, at, before and after of the six fields.
- **Domain:**
  - The new cascade (C5.3), with `pending` = {Open, Overdue, Awaiting forwarding, Awaiting routing}.
  - `canRouteItem()` refuses Void and Closed items (E5).
  - `routingChanges()` builds the before/after diff.
  - The flag `Forwarded before routing` is derived from the stored fact.
- **Server:**
  - `routeInward` needs `registry.route` (granted only by the per-user `canRoute` flag, see C12), with the C5.1 refusal message. It writes a RoutingEvent and an audit entry in one transaction, recalculates the item, then queues the routing email (C6).
  - `updateInward` is reduced to `dateForwarded, receivedByUnitOfficer, ackIssuedVia, dateClosedManual, remarks`.
- **Screens:**
  - `/route`, the Routing Desk: item picker, read-only summary, the six editable fields, and the routing history.
  - Update Item gains read-only "routed to" and "routed by".
  - Forward-before-routing uses a server-driven confirm, like the file "issue anyway" flow.
- All status lists above get "Awaiting routing", with an amber tone.

**Risk**
- Status assertions throughout:
  - `src/domain/rules.test.ts:135`, `scenario.test.ts:48,190`
  - integration `read`, `reports`, `example-and-void`, `jobs-audit`, `numbers`, `workflows`
  - `e2e/scenario.spec.ts:238,305,511`
- `workflows.test.ts:153-240` re-routes through `updateInward`. Those cases move to new routing tests.
- Cached `statusCache` values must be refreshed after the migration. The nightly job or the script's recompute handles it.

**Agreed answers to ambiguities**
- (a) "Forwarded before routing" is a **stored fact set only when the user confirms**. Deriving it from dates would also flag the example I1, which C13.1 doesn't expect.
- (b) **Close today**, and an Update Item that sets `dateForwarded` on an unrouted item, get the same confirm and flag.
- (c) The Head of Registry's full edit (`items.editAny`) **no longer edits the six routing fields**. Only `registry.route` does.
- (d) "Not yet routed" means status Awaiting routing, so closed unrouted items (I1) are excluded. That matches the C13.1 dashboard figure of 1.
- (e) Before routing, officers of the *suggested* unit can already see the item through the `routedUnitId` cache. This is consistent with the save email going to that unit.
- (f) Routing requires an action. An Overdue item can still be routed.

## C6. Acknowledgement email

**Today**
- There is no email code in the repo.
- Jobs run through `src/server/jobs.ts` and `src/app/api/jobs/[job]/route.ts`, from two daily Vercel crons (`vercel.json`).
- Slip: `slipContent()` (`src/domain/slip.ts:70`) and `slipPdf()` (`src/server/pdf/slip.ts:163`).

**Must change**
- **Domain** (`src/domain/ack-email.ts`):
  - `resolveRecipients(unit, division, cc)`: unit ∪ division, deduplicated case-insensitively.
  - `needsRoutingEmail(covered, to)`: true only if `to` holds an address not yet covered.
  - `mergeAddresses()`.
  - `composeAckEmail(kind, item)`: the C6.4 subject and body wording, for `ack | routing | resend`.
- **Server** (`src/server/email/`):
  - The `MailTransport` interface.
  - `devTransport`: writes `.eml` and JSON files to `EMAIL_DEV_DIR`, default `.data/mail`. It is refused in production.
  - The transport is chosen by `EMAIL_TRANSPORT`.
  - Send and Review modes can't be switched on in production while only the dev transport exists.
- **Migration:**
  - `EmailLog`: item, kind, to, cc, subject, status, attempts, error, sentAt, by, createdAt.
  - `InwardItem.ackEmailedTo` (text) and `ackEmailedAt`.
  - Settings `ackEmailMode` (`OFF | REVIEW | SEND`, default OFF) and `ackEmailCc`.
- **Delivery:**
  - Saving an item or routing it inserts an `EmailLog` row in the same transaction. Nothing is sent inside the transaction.
  - Send mode sends after commit through Next `after()`. A new `email-retry` job retries failures with backoff and a maximum number of attempts.
  - `ackEmailedTo` and `ackEmailedAt` are written **only on an actual send** (E1). Failures are logged and shown with the C6.5 wording.
- **Screens:**
  - Registry Desk "Emails to review" (Send / Discard).
  - "Resend ack email", with the C6.1 confirm when the item was already emailed.
  - EmailLog on the item page.
  - Admin email settings.

**Risk**
- Vercel crons on the current setup run daily. A frequent retry cron (every 5–15 min) needs Vercel Pro. **Decided after V0:** keep the daily `email-retry` job plus "Run now" and Resend for now. Email stays Off until a provider is chosen; hosting and retry frequency are reviewed then.
- The slip PDF is rendered inside a server function. Watch time and memory limits.

**Agreed answers to ambiguities**
- (a) A routing email goes to the **full resolved list** (workbook behaviour), not just the new addresses.
- (b) In Review mode, addresses in a **pending-review** email count as covered, so routing doesn't duplicate them. If routing changes the unit while an email is pending, the old pending email becomes `superseded` and the new one replaces it.
- (c) EmailLog statuses are `queued | pending-review | sent | failed | discarded | superseded`. C6.5 lists only the first four.
- (d) Off mode sends nothing and records nothing. Resend in Off mode says the email is switched off (VBA wording).
- (e) The seed's `ackEmailMode: "Display"` is **seeded as Off**, as decided. Review is the app's replacement for Display.

## C7. Outward

**Today**
- The signatory is a `User` with `isSignatory` (`schema.prisma:90`; `OutwardItem.signedById`, line 429).
- `signedByText` exists for imported rows.
- The designation is free text that fills in from the user (`src/app/(staff)/outward/outward-fields.tsx`).

**Must change**
- Migration: a new `Signatory` table (name, designation, active, sortOrder, optional `userId`), and `OutwardItem.signatoryId`.
- `signedByText` and `signatoryDesignation` remain for "someone not on the list".
- Seed the table from `staffFromWorkbook.signatories`. **No user accounts are created** (agreed). The default signatory is the "Secretary to the Commission" entry.
- An admin screen for signatories.
- The outward division is derived from the originating unit.

**Risk:** existing `signedById` rows (dev only) stay readable. The form switches to the signatory list.

**Wrong or ambiguous:** the seed's `_note` says staff names are "not lists to seed", while C7 and V11 seed the signatories. Resolved: seed the signatory table only.

## C8. Internal File Desk

**Today**
- `RegistryFile.reference` is typed and unique, but case-sensitive (`schema.prisma:484`).
- `FILE_CLASS` is a `ListItem` with no code.
- On Issue, the unit is a Select but optional (`FileMovement.unitId` is nullable).
- No reference generator exists (`src/domain/files.ts`).

**Must change**
- Migration:
  - `ListItem.code` (used for FILE_CLASS; seed REG … GEN).
  - Settings `filePrefix` (OGSERC) and `fileRefSerialDigits` (3).
  - A unique index on `lower(reference)`.
- Domain: `nextFileReference(prefix, code, existingRefs, digits)` and `parseFileSerial()`.
- Server:
  - Generation runs inside the insert transaction under `pg_advisory_xact_lock` keyed on the code.
  - A typed reference is still allowed, with a case-insensitive uniqueness check.
  - Missing code gives the C8 message.
- Issue requires a unit from the list. This is validation only, so old rows keep null.
- Picking a file fills title, volume and current holder, read-only.
- Rename the screens to "Internal File Desk".

**Risk:** low. A migration check confirms that no existing references clash case-insensitively.

**Wrong or ambiguous:** a serial past 999 simply grows to 4 digits, as VBA `Format "000"` does. Agreed.

## C9. Registry Desk, Pending Actions, Dashboard

**Today**
- Tiles are in `src/app/(staff)/page.tsx`.
- Summary and breakdowns are in `src/domain/dashboard.ts:32-107` and `src/domain/breakdowns.ts:62-141`.
- Pending is in `src/app/(staff)/pending/page.tsx` and `src/server/pdf/reports.ts`.

**Must change**
- Desk tiles: "Awaiting routing / forwarding", "Awaiting routing", "Awaiting registry (front desk)".
- Desk buttons, each gated by capability: Front Desk, Front Desk Log, Route an item, Resend ack email.
- Pending header and PDF: "Awaiting routing / fwd".
- Dashboard:
  - "Not yet routed" and "At front desk, awaiting registry".
  - A **by-division** table: inward, pending, overdue, closed, outward originated.
  - The by-unit table lists 30 units; the by-type table lists 32 types.

**Spec error (agreed):** C9 defines by-category "open" as Open + Awaiting forwarding + Awaiting routing, which **leaves out Overdue**. That contradicts SPEC §9 R12, which calls for one "pending" definition used everywhere. The app keeps a single **Pending = Open, Overdue, Awaiting forwarding, Awaiting routing** in every table, labelled "Pending". That C9 line is treated as an error in the delta.

## C10. Excel problems E1–E10

| # | Fixed by |
|---|---|
| E1 | Recorded only on an actual send (C6) |
| E2 | Seed validation plus the start-up and admin check (C2) |
| E3 | Role capability `registry.route` with app login (C5, C12) |
| E4 | `RoutingEvent` history (C5) |
| E5 | `canRouteItem` refuses Closed and Void (C5) |
| E6 | `forwardedBeforeRouting` fact, flag and audit (C5) |
| E7 | Reason and audit when receipt time or mode differs from the intake (C3) |
| E8 | Unique keys on both sides of the intake–item link (C3) |
| E9 | Setting `notifyPreviousUnitOnReroute`, default false (Q-V2-2) |
| E10 | Never seeded; importer skips it; test (C3) |

## C11. Open questions

All decided (§1). The settings with workbook defaults are `notifyPreviousUnitOnReroute = false`, `routingRequiresPassword = false`, front desk modes = all, and `ackEmailMode = Off`.

## C12. Roles

**Today**
- `src/domain/permissions.ts` defines 5 roles and a deny-by-default capability table, plus `readScope`.
- **Each user holds exactly one role:** `User.role` is a single enum (`schema.prisma:86`).

**Must change**
- **`FRONT_DESK_OFFICER`:**
  - Capabilities `frontdesk.write` and `frontdesk.read` (awaiting list and own intakes).
  - `readScope` none for inward and outward items. No files, reports or dashboard.
- **Routing is a per-user flag, not a role (decided after V0 review):**
  - `User.canRoute` (boolean, default false). Admins set it on the user screen, and every change is audited.
  - `can(user, "registry.route")` is true only when `canRoute` is set. The flag adds **only** `registry.route` on top of the user's own role.
  - The Secretary keeps the SECRETARY role with `canRoute = true`. The Head of Administration keeps their own role with `canRoute = true`.
  - Routing grants no other access: in particular no Confidential or Personnel files, and no wider read scope.
  - The routing officer still needs to read the item being routed. The Routing Desk loads it under `registry.route` alone (C5.2's read-only fields), whatever the role's `readScope`.
  - `getCurrentUser` reads the flag from the database on every request, so a change takes effect on the next request.
  - Tests:
    - a user with `canRoute` but without the Secretary role can route, but cannot see Confidential or Personnel files;
    - a user without `canRoute` cannot open the Routing Desk or call `routeInward`, whatever their role;
    - changing `canRoute` is audited and takes effect on the next request.
  - This replaces the `ROUTING_OFFICER` role proposed in V0, which would have given the Head of Administration the Secretary's file access.
- **Registry officer:**
  - Loses the routing fields (C4, C5).
  - Gains `frontdesk.read` (Front Desk Log), intake pull, `ackEmail.send` (resend) and review of pending emails.
- **Head of Registry:** keeps everything except the routing fields (C5 c).
- **Admin:** manages units, divisions, emails, signatories, file classes and email settings, via `reference.manage` and `settings.manage`.
- Sidebar gating goes in `src/app/(staff)/layout.tsx`, and every action and query checks on the server.

**Risk:** `src/domain/permissions.test.ts` and `tests/integration/auth.test.ts` need new cases. Existing behaviour stays the same for the other roles.

## C13. Fixtures

**C13.1 updates** (`tests/fixtures/workbook-example.ts`, `prisma/seed/example.ts`, `src/domain/scenario.test.ts:31,48,71,146,190`):
- I1 is in Licensing unit.
- I2 is Awaiting routing.
- I3 is routed with an override to Office of the General Counsel and Secretary (Registry), and closed 8 Dec.
- O1's originating unit is Licensing unit.
- O2 is dated 7 Dec and dispatched 8 Dec. Delivery-not-confirmed: no on 15 Dec, yes on 16 Dec (`workingDaysBetween(8 Dec, 16 Dec) = 6`). This also settles the Phase 8 note that the workbook dispatched O2 on 8 Dec.
- F1 and F2 use the new unit names.
- The dashboard figures for 10 Dec follow from the above.

**C13.2 (V1–V14) placement:**
- Domain tests: V7, V8, V9, V14, plus the status and email-recipient rules behind V2, V3 and V12.
- Integration tests: V1–V6, V10, V12, V13.
- e2e: V1, V4, V6, V11, plus one flow per role.

**Wrong or ambiguous:** none found. The fixture dates check out against the date engine.

---

## Gaps outside C1–C13

1. **Workbook import and compare.** `src/server/import/workbook.ts` and `compare.ts` read the v1 layout: old unit names, and no routing or front desk columns. The parallel run (`docs/PARALLEL_RUN.md`) depends on them. **Added to V8:** read the v2 workbook (routing columns, emailed-to/at, the front desk link), map units by the C1.1 map, and skip the E10 test entry.
2. **STACK.md** rule 15 still says "31 incoming types". **TEMPLATES.md** §3 (Pending counters) and §4 (save message) are superseded by C4, C5.3 and C6. Both docs are fixed in V8.

## Phase plan

| Phase | Scope | Notes |
|---|---|---|
| V1 | Reference data | **First commit restores a green suite.** Then: v2 seed (divisions, units with group and emails, 32 types, file class codes, signatories), seed validation, dev/test reseed, `scripts/upgrade-reference-v2.ts` (single transaction, `--dry-run` report, `--commit --confirm`) |
| V2 | Domain engine | Cascade and pending, flags, front desk number and waiting days, file reference generator, recipients and "already emailed", routing rules. C13 fixtures |
| V3 | Data model and roles | FrontDeskIntake, RoutingEvent, EmailLog, new inward fields, FRONT_DESK_OFFICER, `User.canRoute` granting `registry.route`. Server checks and tests |
| V4 | Front Desk | Front Desk screen and Log, pull into New Inward, slimmed New Inward |
| V5 | Routing | Routing Desk with history, reduced Update Item, forward-before-routing confirm and flag |
| V6 | Email | Transport interface and dev transport, Send / Review / Off, queue and retry, Emails to review, resend, EmailLog |
| V7 | Outward and files | Signatory list and division; Internal File Desk with generated references |
| V8 | Finish | Desk tiles, Pending and Dashboard by division; admin screens; v2 importer; STACK/TEMPLATES wording; user guide; e2e per role; finished GO_LIVE_CHECKLIST |

Each phase stops with tests, lint, typecheck and build passing, commits that reference C-ids, and a summary.
