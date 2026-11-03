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

## Reference data to confirm
- [ ] Default unit for "Licensee returns / performance report": **Performance Monitoring unit** (Admin › Types).
- [ ] Default unit for "Incident / outage report": **Occupational Health, Safety and Performance Analysis unit** (Admin › Types).
- [ ] No warning on Admin › Types about a type whose default unit does not exist.
- [ ] Signatory list and designations (Admin › Signatories).
- [ ] File class codes (Admin › Lists).

## Email
- [ ] Enter the unit and division email addresses (Admin › Units). Only ICT unit, Engineering Services and Electricity Market, Planning and Research have one so far.
- [ ] Choose the email provider and sender mailbox (Q-V2-1). Configure it and send a test.
  - Until then, email stays **Off**. Retries currently run from the daily `email-retry` job, plus "Run now" (Admin › Jobs) and Resend on the Registry Desk.
  - When the provider is chosen, revisit hosting and how often retries run. A cron more frequent than daily needs Vercel Pro.
- [ ] Set `ackEmailCc` if a copy should go to the Registry.
- [ ] Switch `ackEmailMode` from **Off** to Review or Send.

## People and roles
- [ ] Create accounts for the front desk officers (role: Front desk officer).
- [ ] Tick "Can route" on the accounts of the Secretary to the Commission (role: Secretary / management) and the Head of Administration (their own role). Nobody else.
- [ ] Review registry officer, Head of Registry and unit officer accounts against the new units.

## Carried over from Phase 8
- [ ] Restore drill on the production database.
- [ ] NDPA sign-off for data held outside Nigeria.
- [ ] Parallel week with the v2 workbook; daily counts match (`docs/PARALLEL_RUN.md`).
- [ ] Never import the workbook's Front Desk Log test entry (OGSERC/FD/2026/00001).
