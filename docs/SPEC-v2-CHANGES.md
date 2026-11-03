# Registry SPEC — v2 changes (reworked workbook)

Source: `reference/OGSERC_Registry_Correspondence_Workbook_New.xlsm` and `reference/vba/RegistryDesk.v2.bas`, compared formula-by-formula, form-by-form and macro-by-macro with the workbook the app was built from.

**How to use this file.** It is a delta over `docs/SPEC.md`. Where the two disagree, this file wins. Everything in SPEC.md that is not mentioned here is unchanged (date engine, ACK/OUT numbering, outward status cascade, file movement rules, slip wording, the "fix, don't copy" list in SPEC §9). Section ids below (C1, C2…) are referenced by the change prompt and should be referenced in commit messages.

Reference data: replace the seed with `seed-data.json` (v2).

---

## Summary of what changed

| # | Area | Change |
|---|---|---|
| C1 | Organisation | 10 placeholder units → the real **30 units in 5 divisions**, each with a unit group and optional email addresses |
| C2 | Incoming types | 31 → **32** ("Consumer petition / public representation" split in two); every default unit renamed |
| C3 | Front Desk | **New step and new register.** Front desk officers log documents handed in, with an intake number `OGSERC/FD/YYYY/00001` and no acknowledgement |
| C4 | Registration | New Inward no longer captures routing or handling. It can **pull** a front desk intake |
| C5 | Routing | **New step.** Only the Secretary to the Commission or the Head of Administration routes an item (unit, file, action, priority, action officer, due date). New status **Awaiting routing** |
| C6 | Acknowledgement email | Saving an inward item **emails** the acknowledgement (slip PDF attached) to the unit and its division; routing to a new unit emails that unit |
| C7 | Outward | Signatory picked from a list; designation fills in. Outward items carry a division |
| C8 | File Desk | Internal only (unit required, from the unit list). New file references **generated** from the file class |
| C9 | Desk, Pending, Dashboard | New counts (awaiting routing, awaiting registry), a **by-division** table, "pending" now includes Awaiting routing |

---

## C1. Organisation: units, divisions, unit groups, emails

- `Unit`: name, division, unitGroup, emails[] (0..n). 30 units — see seed `units`.
- `Division`: name, emails[] (0..n). 5 divisions — see seed `divisions`.
- A unit's division is derived from the unit (Excel helper column BK on Inward, AN on Outward). Store `divisionId` on the unit only; derive it for items at read time.
- **Admin-editable** (Settings & lists): units, their division/group/emails, divisions and their emails. Every change audited.
- Seed reality check: only `ICT unit` has a unit email (`it@ogserc.org.ng`); only `Engineering Services` and `Electricity Market, Planning and Research` have division emails. Everything else is blank and must be filled by an admin before go-live (see C6 — no address means no email).
- Note: `Front Desk` is now a unit (in Financial Management Services → HR and Admin group).

### C1.1 Unit rename migration (existing data)
The old unit names no longer exist. If the database holds **only dev/test data**, drop and reseed. If it holds data anyone wants to keep, migrate with this **proposed** map and ask the user to confirm it first:

| Old unit | Proposed new unit |
|---|---|
| Office of the Chairman | Office of the General Counsel and Secretary (Registry) *(confirm — "Office of the Chairman" is now a division, not a unit)* |
| Office of the Secretary | Office of the General Counsel and Secretary (Registry) |
| Registration & Licensing | Licensing unit |
| Technical & Market Operations | Performance Monitoring unit *(confirm)* |
| Tariffs & Economic Regulation | Tariff and Rates unit |
| Consumer Affairs | Customer Complaints |
| Legal | Compliance/Legal Services unit: Legal |
| Finance | Finance and Account unit |
| Administration & HR | Human Resources *(confirm; Administration is a separate unit)* |
| Corporate Communications | Public Affairs and Stakeholder unit: Communication |

---

## C2. Incoming types (32)

Full table in seed `incomingTypes`. Changes vs v1:
- "Consumer petition / public representation" → **"Consumer petition"** (Customer Complaints, 10 days) and **"Public representation"** (Public Affairs and Stakeholder unit: Communication, 10 days). Neither uses para 10(3) wording.
- All default units renamed to the C1 units.
- **Workbook bug (fix):** two types point at units that do not exist in the unit list, so they get no division and no email:
  - "Licensee returns / performance report" → `Performance Monitoring unit, Market Analysis`
  - "Incident / outage report" → `Performance Monitoring unit, Occupational Health and Safety`
  Seed flags them `defaultUnitValid: false`. Seeding must not silently create those units. Proposed defaults until the user confirms: **Performance Monitoring unit** and **Occupational Health, Safety and Performance Analysis unit**. Add a startup/admin check that every type's default unit exists.
- Targets, Order references and para 10(3) flags are otherwise unchanged.

---

## C3. Front Desk intake (new)

Documents handed in at the front desk are logged **before** the Registry registers them. No acknowledgement is issued at this point.

### C3.1 Entity `FrontDeskIntake`
| Field | Type | Notes |
|---|---|---|
| intakeNo | text, unique | `OGSERC/FD/{YYYY}/{00000}`; assigned once in the insert transaction; **year = calendar year of receivedAt** (not deemed) |
| receivedAt * | datetime (Lagos) | default now; not in the future |
| sender * | text | |
| subject * | text | |
| type | IncomingType | "if known" |
| mode | ReceiptMode | default `Hand delivery` |
| deliveredBy, phone | text | |
| volumes | int ≥ 0 | |
| receivedBy * | User (front desk officer) | logged-in user |
| remarks | text | |
| inwardItemId | FK → InwardItem, unique, nullable | set when registered |
| registeredAt | datetime | set when registered |

Derived: `status` = `Registered` if inwardItemId else `Awaiting registry`; `workingDaysWaiting` = `workingDaysBetween(date(receivedAt), date(registeredAt) ?? today)`.

### C3.2 Actions
- **Save (Front Desk form):** validate required fields; assign intake number; message: `Logged as {intakeNo}. No acknowledgement has been issued. Pass the document to the Registry - it stays on the 'Awaiting registry' list until the Registry registers it.`
- **Front Desk screen** shows the form plus the "Awaiting registry" list (intake no., time, sender, subject, working days waiting).
- **Front Desk Log** = register of all intakes, filterable, CSV export.
- **Pull into New Inward:** registry officer picks an intake from the *awaiting registry* list → the form fills `receivedAt, mode, type, sender, subject, phone, deliveredBy, volumes, remarks` from the intake (only non-blank values). If the form already has data: confirm `Replace what is typed on this form with the front desk details?`. If the intake is already registered: `{intakeNo} is already registered as {ackNo}.`
- **Saving the inward item** with an intake selected: in one transaction, create the inward item, set `intake.inwardItemId` and `registeredAt = now`, store `inwardItem.frontDeskIntakeId`. A unique constraint must make double registration impossible.
- **Receipt time:** the front desk `receivedAt` is kept as the inward item's receipt time (it drives para 10(3) deemed receipt). If the registry officer changes it on the form, require a reason and audit it (new rule).
- Front desk officers do not see the inward/outward registers (C13).

---

## C4. New Inward (registration) — slimmed form

Removed from the intake form (moved to Routing, C5): **file reference, unit override, action required, priority, action officer, response-due override.**

Remaining fields and required set (`*`): receivedAt*, mode*, type*, sender*, senderCategory*, subject*, senderRef, documentDate, relatedOgsercNo, inResponseToOutward, cacNo, principalLga, contactPerson, phone, email, deliveredBy, volumes, schedule2DocsAttached, feeEvidenceAttached, paymentRef, amountShown, receivedBy* (default logged-in officer), ackIssuedVia* (default Printed slip), remarks — plus the optional **front desk intake** picker (C3.2).

- Until routed, `routedUnit` = the type's default unit ("suggested unit"); `actionRequired` is blank; `responseDue` is computed as in SPEC §4.2 (blank action is not "For information", so the type target applies).
- Flag change: **"Missing required field"** no longer checks action required.
- Save message: `Saved as {no}.` / `Suggested unit: {unit}` / `Routing, file reference and handling will be set by the Secretary / Head of Admin on the Routing Desk.` followed by the email result line (C6).

---

## C5. Routing (new step)

### C5.1 Who
Only **routing officers**: the Secretary to the Commission and the Head of Administration (seed `staffFromWorkbook.routingOfficers`). In the app this is a capability `registry.route` on a role, not a list of names.
- Workbook auth = pick your name + Windows user name match **or** a PIN stored in plain text on the Lists sheet. **Do not copy.** The logged-in user must hold `registry.route`; `routedBy` = that user. Optional step-up (re-enter password before saving routing) — open question Q-V2-3.
- Refusal message for anyone else: `Only the Secretary to the Commission and the Head of Administration can route items.`

### C5.2 Routing Desk
Load an inward item (picker). Read-only: sender, subject, type, status, current unit, division. Editable: **unit override, file reference, action required \*, priority, action officer, response-due override**. Save sets `routedById`, `routedAt = now`, recalculates, then runs the routing email (C6). Message: `{no} routed to {unit} by {name}.` / `Status: {status}` + email line.
- Re-routing is allowed (the workbook overwrites silently). **App:** keep a routing history (each save = a `RoutingEvent` row: who, when, before/after of the six fields). Block routing of Closed or Void items (workbook doesn't check).

### C5.3 Inward status cascade (replaces SPEC §4.3)
1. `Void`
2. `Closed` — closedOn set
3. `Overdue` — responseDue set and today > responseDue
4. if dateForwarded empty: `Awaiting routing` when not routed, else `Awaiting forwarding`
5. `Noted / filed` — action ∈ {For information, File only}
6. `Open`

`Pending` (Pending Actions, unit filter, dashboard) = {Open, Overdue, Awaiting forwarding, **Awaiting routing**}. Pending Actions header counter becomes "Awaiting routing / fwd" = Awaiting routing + Awaiting forwarding.

### C5.4 Update Item (inward) — reduced
Read-only additions: routed to unit, routed by. Editable now only: **dateForwarded, receivedByUnitOfficer, ackIssuedVia, dateClosedManual, remarks.** (Unit, action officer, priority, due override and file reference moved to Routing.)
- **Forwarded today** on an item not yet routed: confirm `{no} has not been routed by the Secretary / Head of Admin yet. Forward it anyway?`. App addition: if confirmed, add flag `Forwarded before routing` (audited).
- Close today unchanged (plus the app's required closing note).

---

## C6. Acknowledgement email (new)

### C6.1 When
- **On inward save:** email the acknowledgement for the new item.
- **On routing save:** email only if the resolved recipients include an address **not already emailed** for this item (i.e. routing changed the unit/division). Routing to the same unit sends nothing.
- **Resend** (Registry Desk, for the chosen ACK number): if already emailed, confirm `{no} was emailed on {dd-MMM-yyyy HH:mm} to {addresses}. Send it again?`.

### C6.2 Recipients
`to` = emails of the item's current unit **∪** emails of that unit's division (deduplicated, case-insensitive). `cc` = `settings.ackEmailCc` if set. If `to` is empty: do not send; message `Acknowledgement not emailed: no email address is set for '{unit}' or its division.` (app: point to Admin › Units).

### C6.3 Mode (setting `ackEmailMode`)
Workbook: `Send` (auto), `Display` (open in Outlook for review — **current value**), `Off`. App mapping:
- `Send` — send immediately from the server.
- `Review` (replaces Display) — create a pending email the registry officer reviews and sends from the Registry Desk ("Emails to review").
- `Off` — nothing is sent or recorded.
**Fix:** the workbook records an email as sent even in Display mode when the user may close it unsent. The app records `emailedAt/emailedTo` **only when actually sent**, and logs failures.

### C6.4 Content (keep wording)
Subject — save/resend: `Acknowledgement {no} - {type} from {sender}`; routing: `Routed to {unit}: {no} - {sender}`.
Body lines: `The Registry has received and acknowledged the item below.` / Inward / Ack. No. / Type / Sender / Subject / `Received: {dd-MMM-yyyy HH:mm} (deemed {dd-MMM-yyyy})` / Received by / Unit / Division. Then, on routing: Routed by, Action required, Priority, Action officer, Response due, File reference; otherwise `Routing, file reference and handling will follow from the Secretary to the Commission / Head of Administration.` Then `The acknowledgement slip is attached.` / `OGSERC Registry`. Attachment: the slip PDF (TEMPLATES §1), file `Slip OGSERC-ACK-…pdf`.

### C6.5 Delivery
Server-side email (Microsoft 365 / SMTP — provider is open question Q-V2-1), sent from a job/queue with retry so a mail failure never blocks saving the item. `EmailLog` table: item, kind (ack | routing | resend), to, cc, status (queued | pending-review | sent | failed), error, sentAt, by. Inward item shows `ackEmailedTo` and `ackEmailedAt` (Excel BI/BJ). Failure message keeps the workbook's meaning: `Acknowledgement not emailed: {reason}. Use RESEND ACK EMAIL on the Registry Desk.`

---

## C7. Outward changes
- **Signatory** chosen from a signatory list (name + designation; seed `staffFromWorkbook.signatories`: Chairman, Secretary to the Commission). Designation fills in from the choice; free text still allowed for someone not on the list. Default signatory = the Secretary. Admin-editable list (or users flagged as signatories).
- Outward items derive **division** from the originating unit (for the dashboard).
- Status cascade, response logic, flags: unchanged.

---

## C8. File Desk changes
- Called **Internal File Desk**: files move only between OGSERC units and officers. On Issue, **unit is required** and must be one of the units (no free text).
- Picking a file reference fills title, current volume and current holder (read-only).
- **New file reference generated** from the file class: `OGSERC/{code}/{NNN}` (3 digits), NNN = highest existing serial for that code + 1 (case-insensitive match), computed in the insert transaction. Overtyping a reference is still allowed; uniqueness enforced. File classes and codes in seed `fileClasses` (REG, RL, TM, TS, CA, LEG, FIN, ADM, PF, GOV, POL, GEN). Missing code → `Set a file class code for '{class}' in Admin, or type the file reference.`

---

## C9. Registry Desk, Pending Actions, Dashboard
**Registry Desk tiles:** Received today, Dispatched today, **Awaiting routing / forwarding** (routing + forwarding), Incoming overdue, Not yet dispatched, Replies overdue to us, Files out; plus **Awaiting routing** and **Awaiting registry (front desk)** counts. New buttons: Front Desk, Front Desk Log, Route an item (routers only), Resend ack email.

**Dashboard additions/changes:**
- "Awaiting routing / forwarding" = Awaiting routing + Awaiting forwarding; "Not yet routed" = Awaiting routing; "At front desk, awaiting registry" = intakes not registered.
- **By division** table: inward routed (count by division of current unit), open, overdue, closed, outward originated.
- By-unit table now lists the 30 units.
- By category "open" = Open + Awaiting forwarding + Awaiting routing (consistent with the app's single "pending" definition, SPEC §9 R12).
- Incoming by type lists the 32 types.

---

## C10. New Excel problems — fix, don't copy
- **E1** Display mode marks email as sent even if never sent → record only real sends (C6.3).
- **E2** Two types point at non-existent units → validated seed + admin check (C2).
- **E3** Routing PIN in plain text / Windows user name bypass → role capability (C5.1).
- **E4** Re-routing overwrites without history → `RoutingEvent` history (C5.2).
- **E5** Routing allowed on closed items → blocked (C5.2).
- **E6** Forwarding before routing leaves no trace → flag + audit (C5.4).
- **E7** Front desk receipt time can be overwritten silently on New Inward → reason + audit (C3.2).
- **E8** Double registration of one intake is prevented only by a macro check → unique constraint (C3.2).
- **E9** The suggested unit is emailed before routing; if routing moves the item, the first unit is never told → open question Q-V2-2.
- **E10** The workbook's Front Desk Log contains a real test entry (OGSERC/FD/2026/00001, Verge Power Limited, 3 Nov 2026). It is not an example row; never seed or import it.

---

## C11. Open questions (make them settings with the workbook's behaviour as default)
- **Q-V2-1** Email provider and sender mailbox (Microsoft 365 / Graph or SMTP; e.g. registry@ogserc.org.ng). Until answered, implement a provider interface with a dev "log to console/file" transport.
- **Q-V2-2** When routing moves an item away from the suggested unit, notify the first unit? (default: no — workbook)
- **Q-V2-3** Require routers to re-enter their password when saving routing? (default: no)
- **Q-V2-4** Confirm the C1.1 unit migration map and the two C2 default units.
- **Q-V2-5** Should front desk officers also be able to log email/portal items, or hand deliveries only? (default: any mode — workbook)
- **Q-V2-6** Fill in unit and division email addresses (only 3 exist).

---

## C12. Roles (update SPEC §10)
| Role | Change |
|---|---|
| **Front desk officer** (new) | Log intakes; view the awaiting-registry list and own intakes. No access to inward/outward registers, routing or files. |
| **Routing officer** (new capability `registry.route`; Secretary, Head of Administration) | Routing Desk; read all inward items. |
| Registry officer | Can no longer set unit, file, action, priority, action officer or due override. Gains: pull intakes, resend ack email, review pending emails (Review mode). |
| Admin | Also manages units/divisions/emails, signatories, file classes, email settings. |

---

## C13. Fixtures (update SPEC §12; "today" = 10 Dec 2026 unless stated)

### C13.1 Example scenario with v2 data
- **I1** REG-01 (as before) → unit **Licensing unit**, division Legal, Licensing and Consumer Affairs; due 18 Dec; forwarded 20 Nov without routing (example data) → closed 25 Nov by O1.
- **I2** Deficiency response, email 30 Nov 18:40 → deemed 1 Dec; due 15 Dec; not routed, not forwarded → status **Awaiting routing**; flag `Not forwarded within target` (7 working days at registry); counts in Pending and in "Awaiting routing / forwarding".
- **I3** NERC letter, unit override **Office of the General Counsel and Secretary (Registry)** (division Office of the Chairman), forwarded 2 Dec, Reply required, High → due 16 Dec; closed **8 Dec** by O2.
- **O1** unchanged except originating unit **Licensing unit** → Response received 1 Dec.
- **O2** Letter to NERC dated **7 Dec**, dispatched **8 Dec**, courier, signed Chairman, in reply to I3 → status Dispatched; working days to dispatch 1; `Delivery not confirmed` **not** on 15 Dec (5), **yes** on 16 Dec (6).
- Files F1/F2 unchanged except units renamed (Licensing unit; Office of the General Counsel and Secretary (Registry)); F2 still Overdue on 10 Dec.
- Dashboard 10 Dec: awaiting routing 1, awaiting routing/forwarding 1, closed 2, at front desk 0; by division: Legal, Licensing and Consumer Affairs inward 2 (I1, I2), Office of the Chairman inward 1 (I3).

### C13.2 New behaviour
- **V1** Registry officer opens Routing Desk → refused with the C5.1 message.
- **V2** Secretary routes I2 (unit unchanged, action "Action required") on 10 Dec → status **Awaiting forwarding**; routedAt set; no email is sent, and the message says `Acknowledgement not emailed: no email address is set for 'Licensing unit' or its division` (neither has an address in the seed). Once addresses exist, routing to the unit already emailed at save sends nothing.
- **V3** Secretary re-routes I2 to **ICT unit** → routing email to `it@ogserc.org.ng` (division Financial Management Services has none); routing history has 2 events. Re-route to ICT unit again → no email.
- **V4** Forwarded today on an unrouted item → confirm prompt; after confirming, flag `Forwarded before routing`.
- **V5** Route a Closed item → refused.
- **V6** Front desk logs hand delivery Fri 4 Dec 2026 16:30 → `OGSERC/FD/2026/00001`, Awaiting registry; on 10 Dec waiting 4 working days. Registry pulls it on 10 Dec and saves → inward receivedAt 4 Dec 16:30, deemed 4 Dec, next ACK number; intake Registered with that ACK; pulling it again → `… is already registered as …`.
- **V7** Intake 24 Dec 2026, registered 29 Dec → waiting 1 working day.
- **V8** Intake logged 31 Dec 2026 23:00 → number in the **2026** FD series (calendar year), while an email inward item at that time is deemed 4 Jan 2027 (ACK 2027 series).
- **V9** New file, class "Licensee file" with RL/001 existing → `OGSERC/RL/002`; class "Policy & regulations" with none → `OGSERC/POL/001`; typed `ogserc/rl/002` when RL/002 exists → refused (case-insensitive).
- **V10** Issue a file with a unit not in the list → refused.
- **V11** Outward: choose signatory Jide Onakoya → designation Chairman.
- **V12** Email mode Off → no email, nothing recorded. Review → item appears in "Emails to review"; `ackEmailedAt` stays empty until sent. Send → recorded with recipients.
- **V13** Seeding with "Licensee returns / performance report" pointing at a non-existent unit → seed/admin check reports it; nothing silently created.
- **V14** Save inward with action left blank → saves; no "Missing required field" flag.
