# Go-live checklist (Registry v2)

Started in Phase V0 and finished in V8. Tick each item before the app replaces the workbook.

## Database upgrade
- [ ] **Upgrade production to the v2 reference data:**
  - [ ] Back up the production database and test the restore before running `upgrade-reference-v2`.
  - [ ] Run `scripts/upgrade-reference-v2.ts --dry-run` against production and review the before/after report (units, divisions, types, user units, settings, signatories).
  - [ ] Run it with `--commit --confirm`. It runs in one transaction, so it applies all of its changes or none.
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
- [ ] Set `ackEmailCc` if a copy should go to the Registry.
- [ ] Switch `ackEmailMode` from **Off** to Review or Send.
- [ ] Email retry job scheduled (needs Vercel Pro for a frequent cron).

## People and roles
- [ ] Create accounts for the front desk officers (role: Front desk officer).
- [ ] Create accounts for the Secretary to the Commission and the Head of Administration (role: Routing officer).
- [ ] Review registry officer, Head of Registry and unit officer accounts against the new units.

## Carried over from Phase 8
- [ ] Restore drill on the production database.
- [ ] NDPA sign-off for data held outside Nigeria.
- [ ] Parallel week with the v2 workbook; daily counts match (`docs/PARALLEL_RUN.md`).
- [ ] Never import the workbook's Front Desk Log test entry (OGSERC/FD/2026/00001).
