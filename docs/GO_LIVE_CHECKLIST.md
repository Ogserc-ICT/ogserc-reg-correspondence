# Go-live checklist (Registry v2)

Started in Phase V0 and finished in V8. Tick each item before the app replaces the workbook.

## Database upgrade
- [ ] **Upgrade production to the v2 reference data:**
  - [ ] Back up the production database and test the restore before running `upgrade-reference-v2`.
  - [ ] Apply the migrations (a production deploy runs `prisma migrate deploy`).
  - [ ] From a trusted machine, with the production `DATABASE_URL_UNPOOLED`, run `npx tsx scripts/upgrade-reference-v2.ts` (dry run). Review every before/after line: units, divisions, types, user units, file classes, signatories.
  - [ ] Run `npx tsx scripts/upgrade-reference-v2.ts --commit --confirm <fingerprint>`, using the fingerprint the dry run printed. It runs in one transaction, so it applies all of its changes or none, and it saves nothing if the data changed since the dry run.
  - [ ] Run the dry run once more. It should say "No changes".
  - [ ] Check that unit officers' units were remapped by the confirmed C1.1 map.
  - [ ] Run **Refresh statuses** (Admin › Jobs › Run now). The v2 status "Awaiting routing" is stored only after this first refresh; the nightly job keeps it current afterwards.

## Reference data to confirm
- [ ] Default unit for "Licensee returns / performance report": **Performance Monitoring unit** (Admin › Types).
- [ ] Default unit for "Incident / outage report": **Occupational Health, Safety and Performance Analysis unit** (Admin › Types).
- [ ] No warning on Admin › Types about a type whose default unit does not exist.
- [ ] Signatory list and designations, and the default signatory (Admin › Organisation).
- [ ] File class codes (Admin › Organisation) and the file reference prefix and digits (Admin › Settings).
- [ ] Every unit has its division (Admin › Organisation).

## Email
- [ ] Enter the unit and division email addresses (Admin › Organisation). Only ICT unit, Engineering Services and Electricity Market, Planning and Research have one so far.
- [ ] Choose the email provider and sender mailbox (Q-V2-1). Configure it and send a test.
  - Until then, email stays **Off**. Retries currently run from the daily `email-retry` job, plus "Run now" (Admin › Jobs) and Resend on the Registry Desk.
  - When the provider is chosen, revisit hosting and how often retries run. A cron more frequent than daily needs Vercel Pro.
  - The provider needs code for its transport (`src/server/email/transport.ts`); only `EMAIL_TRANSPORT=dev` exists, and production refuses to start with it. Leave `EMAIL_TRANSPORT` unset in production until then; set `EMAIL_FROM` to the sender mailbox.
  - Admin › Settings won't switch the email to Review or Send while no provider is set up.
- [ ] Set the CC (Admin › Settings, "Copy (CC) every acknowledgement to") if a copy should go to the Registry.
- [ ] Switch the acknowledgement email from **Off** to Review or Send (Admin › Settings). In Review, check the Emails page (or the Registry Desk notice) daily.

## Decisions to record (C11)
- [ ] Q-V2-2: notify the previous unit when routing moves an item away. Built with the agreed wording; only addresses that actually received the acknowledgement are told, with no slip. Off by default (workbook): the Commission switches it on in Admin › Settings.
- [ ] Q-V2-3: routers re-enter their password to save routing (Admin › Settings; default no).
- [ ] Q-V2-5: the front desk may log any mode of receipt, not only hand deliveries (Admin › Settings; default yes).
- [x] C13.1 (decided): file references are set only on the Routing Desk, so an unrouted item (I2) has none. When an item answers one of our letters, the Routing Desk suggests that letter's file. Through the screens, the example's RL/001 shows 1 inward item and last correspondence 25 Nov (the seeded data keeps the workbook's 2 and 1 Dec).

## People and roles
- [ ] Create accounts for the front desk officers (role: Front desk officer).
- [ ] Tick "Can route" on the accounts of the Secretary to the Commission (role: Secretary / management) and the Head of Administration (their own role). Nobody else.
- [ ] Review registry officer, Head of Registry and unit officer accounts against the new units.
- [ ] Give registry staff, front desk officers and the two routers the updated guide (`docs/USER_GUIDE.md`).

## Carried over from Phase 8
- [ ] Restore drill on the production database.
- [ ] NDPA sign-off for data held outside Nigeria.
- [ ] Parallel week with the v2 workbook; daily counts match (`docs/PARALLEL_RUN.md`).
- [ ] When importing the v2 workbook, read the warnings: "Ack. emailed" columns are not imported (E1), and a router who isn't a user in the app is kept without a name.
- [ ] The workbook's Front Desk Log test entry (OGSERC/FD/2026/00001, Verge Power Limited) is never imported: the importer doesn't read that sheet (tested).
