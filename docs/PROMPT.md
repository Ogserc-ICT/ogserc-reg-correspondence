# Change prompt — Registry workbook v2

Paste the block below into Claude Code (Plan mode) after copying this pack into the repo.

```
The Registry workbook has been reworked. The app must now match the new version.

Read, in this order:
1. CLAUDE.md and STACK.md (rules still apply)
2. docs/SPEC.md (current rules)
3. docs/SPEC-v2-CHANGES.md — the delta. Where it disagrees with SPEC.md, it wins.
4. seed-data.json (v2 reference data; replaces the old seed)
Cross-check against reference/OGSERC_Registry_Correspondence_Workbook_New.xlsm and reference/vba/RegistryDesk.v2.bas only when the spec is unclear.

First, add one line under "Source of truth" in CLAUDE.md:
"docs/SPEC-v2-CHANGES.md overrides docs/SPEC.md where they differ."

Then do Phase V0 only — no code changes:
Inspect the app and write docs/V2_GAP_REPORT.md with, for each section C1–C13 of SPEC-v2-CHANGES.md:
- what the app does today (file paths),
- what must change (models, migrations, domain functions, server actions, screens, tests),
- risk to existing data and tests,
- anything in the delta you think is wrong or ambiguous.
Also state whether the database holds anything other than dev/test data (this decides reseed vs the C1.1 migration), and list the C11 open questions that block you, with the default you'd use.

Then stop and wait. After I approve, the phases are:
- V1 Reference data: v2 seed (units with division/group/emails, divisions, 32 types, file classes, signatories), seed validation (every type's default unit must exist — C2), unit migration or reseed (C1.1).
- V2 Domain engine + tests: new inward status cascade and "pending" (C5.3), flag changes (C4, C5.4), front desk number and waiting days (C3.1), file reference generator (C8), email recipient resolution and "already emailed" rule (C6.1–C6.2), routing rules (C5). Every fixture in C13 must pass; existing SPEC §12 fixtures updated per C13.1.
- V3 Data model + roles: FrontDeskIntake, RoutingEvent, EmailLog, new inward fields (routedBy/At, frontDeskIntakeId, ackEmailedTo/At), capabilities for Front desk officer and registry.route (C12). Server-side checks and tests.
- V4 Front Desk screen, Front Desk Log, pull-into-New-Inward, slimmed New Inward form (C3, C4).
- V5 Routing Desk with history, reduced Update Item, forward-before-routing confirm (C5).
- V6 Acknowledgement email: provider interface with a dev transport, Send / Review / Off modes, queue with retry, "Emails to review" on the Desk, resend, EmailLog (C6).
- V7 Outward signatory list + division; Internal File Desk with generated references (C7, C8).
- V8 Registry Desk tiles, Pending Actions, Dashboard by division (C9); admin screens for units/divisions/emails, signatories, file classes, email settings; update the user guide; e2e flows per role.

Rules for every phase:
- Use the existing dark UI components; no new visual style.
- Business logic stays pure in src/domain with tests; permissions on the server; every write audited.
- Do not weaken any existing rule from SPEC.md §9 that v2 doesn't mention.
- Stop at the end of each phase and summarise: what changed, tests added, decisions taken, open questions.
```
