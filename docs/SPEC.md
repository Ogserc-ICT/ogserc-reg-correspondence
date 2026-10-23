# OGSERC Registry (Correspondence) System — Business Rules Spec

Source: `reference/OGSERC_Registry_Correspondence_Workbook.xlsm` (cell formulas, named ranges, data validations) and its VBA (`reference/vba/RegistryDesk.bas`). Every rule below was extracted from those. Where this spec says the Excel is wrong (§9), follow the spec, not the workbook.

Reference data (types, units, lists, settings, holidays) is in `seed-data.json`. Seed from it; never hard-code those values in components.

---

## 0. Purpose and scope

The Registry records every item of correspondence the Commission **receives** (inward) or **sends** (outward), issues acknowledgements (including those required by para 10(3) of the OGSERC Order on Commencement of Operations and Registration of Licensees and Electricity Operators, 2026), routes inward items to units, chases responses in both directions, and tracks where every physical file is.

Users are OGSERC staff only. There is no public-facing part.

This is a **standalone app with its own repo, database, users and roles**. It is separate from the OGSERC Registration & Evaluation app, but both use the `OGSERC/ACK` number series (see §3.3).

---

## 1. Entities

| Entity | Excel source | Notes |
|---|---|---|
| `InwardItem` | Inward Register (1 row = 1 item) | |
| `OutwardItem` | Outward Register | |
| `RegistryFile` | File Index | A physical Commission file (e.g. `OGSERC/RL/001`) |
| `FileMovement` | File Movement | One row each time a file leaves the Registry |
| `IncomingType` | Lists A:F | name, category, defaultUnit, orderRef, responseTargetDays, para103SlipWording |
| `OutgoingType` | Lists H:J | name, responseExpected, responseWindowDays, **closesInwardItem (new, §9 R4)** |
| `Unit` | Lists M | 10 units |
| `PublicHoliday` | Settings A21:D80 | date, name, status (Fixed / Provisional / Estimated) |
| `RegistrySettings` | Settings B5:B16 | single row; see seed `settings` |
| Simple lists | Lists L, N–V | receipt modes, LGAs, ack-via, party categories, action required, priorities, file class, security, file status |

Staff names (Lists Z) and Secretary names (Lists AA) become **users** of the app, not text lists (§9 R8).

---

## 2. Date engine (one module, pure functions, fully unit-tested)

All "working day" logic in the workbook uses Excel `WORKDAY` / `NETWORKDAYS` with the holiday list `Hols`. Reproduce exactly.

- **Time zone:** every "today" and every date derived from a timestamp uses **Africa/Lagos**, never the server's UTC date (§9 R7).
- `isWorkingDay(d)` = Monday–Friday and `d` not in `PublicHoliday`.
- `addWorkingDays(d, n)` = Excel `WORKDAY(d, n, Hols)`: step forward one day at a time, counting only working days, until `n` have been counted. `d` itself is not counted.
- `workingDaysBetween(a, b)` = `MAX(0, NETWORKDAYS(a, b, Hols) − 1)`. NETWORKDAYS counts working days in `[a, b]` inclusive; the workbook always subtracts 1 and floors at 0. Use this single helper for every "working days at registry / open / out / to dispatch / since dispatch" figure.

### 2.1 Deemed receipt date (para 10(3)) — Inward Register col G
```
d = calendar date of receivedAt (Lagos)
if NOT isWorkingDay(d)                                   → addWorkingDays(d, 1)
elif mode ∈ settings.afterHoursModes                     ("Email", "Online portal")
     AND timeOf(receivedAt) >= settings.officeClosingTime (17:00) → addWorkingDays(d, 1)
else                                                      → d
```
Note: exactly 17:00 counts as after hours (`>=`). Hand delivery, courier and post after 17:00 on a working day are deemed received **the same day** (Excel behaviour; see open question Q3).

### 2.2 Registration deadline
`registrationDeadline = effectiveDate + 60 calendar days` (Settings B15, para 11(1)). With the placeholder Effective Date of 2 Nov 2026 this is **1 Jan 2027, a public holiday**. The Excel does not roll it forward. Make the rollover a setting (`deadlineRollsToNextWorkingDay`, default **false** until Legal answers Q1). Para 25 extensions are entered manually as an override date.

---

## 3. Numbering

### 3.1 Formats
| Series | Format | Year taken from |
|---|---|---|
| Inward / acknowledgement | `{ackPrefix}/{YYYY}/{00000}` → `OGSERC/ACK/2026/00001` | **deemed receipt date** |
| Outward | `{outPrefix}/{YYYY}/{00000}` → `OGSERC/OUT/2026/00001` | **date of document** |

Serial restarts at 00001 each year per series.

### 3.2 Assignment rule (from VBA `AssignNumber`)
The Excel assigns `max(serial already used in that series+year) + 1` at the moment of saving, then locks it. In the app:

- Keep a counter table `(series, year) → lastValue`. Increment it inside the same DB transaction that inserts the item (`SELECT … FOR UPDATE` or `UPDATE … RETURNING`). Two officers saving at the same moment must never get the same number.
- The number is assigned **once, at creation**, and never changes — not when dates are edited, not when the item is voided. If an officer corrects `receivedAt` so the deemed year changes, keep the number and record a flag (`Number year differs from deemed receipt year`).
- No deletes. An item entered in error is **voided** (status `Void`, reason required, head of registry only). Voided numbers are never reissued and are excluded from all counts except an "items voided" figure.

### 3.3 The ACK series is also used by the separate Registration & Evaluation app (decide in Phase 0)
The workbook's Guide says the `OGSERC/ACK` series "is used in the Registration Register and the EVAL-01 workbook". The Registration & Evaluation app is a **separate system** that also generates `OGSERC/ACK` numbers on its own. If both apps generate numbers independently, the Commission will get two different items with the same acknowledgement number.

This app cannot fix that alone. Options to put to the user (do not pick one yourself):
1. **The Registry issues all ACK numbers (recommended).** Everything that arrives — including REG-01 filings — is logged here first and gets its ACK number here. The Registration & Evaluation app stops generating ACK numbers and instead records the Registry's ACK number at intake. (That change is made in the other repo, not here.)
2. **Separate prefixes.** Each app gets its own series (e.g. this app keeps `OGSERC/ACK`, the registration app uses something else). Simple, but changes the numbering the Order's slips and letters refer to.
3. **Shared number service later.** A small API that both apps call. Only worth it if the ERP direction makes the apps talk to each other.

Build this app so the prefix is a setting and the number service is one function (`nextNumber(series, year, tx)`), so any of the three can be adopted without rework.

Yearly restart: this workbook restarts the serial every year (year of deemed receipt). The Registration workbook uses one global sequence. Default here: **yearly restart**; list it as an open question (Q2).

---

## 4. Inward items

### 4.1 Input fields (New Inward form; `*` = required, from form column F)
| Field | Type | Default / notes |
|---|---|---|
| receivedAt * | datetime (Lagos) | now. Must not be in the future. |
| mode * | ReceiptMode | |
| type * | IncomingType | |
| sender * | text | |
| senderCategory * | PartyCategory | |
| subject * | text | |
| senderRef | text | |
| documentDate | date | |
| relatedOgsercNo | text | Registration no. or earlier ACK no. Hint: "needed for updates, annual confirmations and deficiency responses". |
| inResponseToOutwardId | FK → OutwardItem | Excel: "In Response to Our Ref." (typed outward no.) |
| cacNo | text | |
| principalLga | LGA | |
| contactPerson, phone, email | text | validate email/phone format (new) |
| deliveredBy | text | |
| volumes | int ≥ 0 | |
| schedule2DocsAttached | int ≥ 0 | Hint: "REG-01: 12 required (13 for a multi-State licensee)" |
| feeEvidenceAttached | Y/N | |
| paymentRef | text | |
| amountShown | decimal (₦) | |
| receivedBy * | User | logged-in registry officer |
| fileId | FK → RegistryFile | |
| unitOverride | Unit | "only to override" |
| ackIssuedVia * | AckVia | default `Printed slip` |
| actionRequired * | ActionRequired | |
| priority | Priority | default `Normal` (blank = Normal) |
| actionOfficer | text or User | |
| responseDueOverride | date | "Use when the sender sets a deadline." |
| remarks | text | |

Handling fields set later (Update Item): `dateForwarded`, `receivedByUnitOfficer`, `dateClosedManual`, plus edits to unitOverride, actionOfficer, priority, responseDueOverride, ackIssuedVia, fileId, remarks.

### 4.2 Derived fields (compute in the domain layer; never trust stored copies for status)
| Field | Rule (Excel col) |
|---|---|
| deemedReceiptDate | §2.1 (G) |
| category | `IncomingType.category` (I) |
| orderRef | `IncomingType.orderRef` (J) |
| routedUnit | `unitOverride ?? IncomingType.defaultUnit` (AE) |
| targetDays | `IncomingType.responseTargetDays`; if type missing → `settings.defaultResponseTargetDays` (BB) |
| responseDue | (AN) `responseDueOverride` if set; else none if actionRequired ∈ {For information, File only}; else if priority = Urgent → `addWorkingDays(deemed, urgentResponseTargetDays)`; else if targetDays > 0 → `addWorkingDays(deemed, targetDays)`; else none |
| replyOutward | the outward item that closes it (AO) — see R3/R4: earliest **dispatched** outward item with `inReplyTo = this` and `OutgoingType.closesInwardItem = true` |
| replyDispatchedOn | that item's dateDispatched (AP) |
| closedOn | `dateClosedManual ?? replyDispatchedOn` (AR) |
| status | §4.3 (AS) |
| workingDaysAtRegistry | `workingDaysBetween(deemed, dateForwarded ?? today)` (AT) |
| workingDaysOpen | `workingDaysBetween(deemed, closedOn ?? today)` (AU) |
| filedAfterRegistrationDeadline | only for type `REG-01 Registration (new)`: `deemed > registrationDeadline ? Yes : No` (AV) |
| closedOnTime | only if status Closed and responseDue set: `closedOn <= responseDue` (BD) |

### 4.3 Status (evaluate in this order; Excel AS)
1. `Void` (new) if voided
2. `Closed` if closedOn set
3. `Overdue` if responseDue set and today > responseDue
4. `Awaiting forwarding` if dateForwarded empty
5. `Noted / filed` if actionRequired ∈ {For information, File only}
6. `Open`

"Pending" (Pending Actions list) = status ∈ {Open, Overdue, Awaiting forwarding}.

### 4.4 Flags (warnings; show on the record, count on the dashboard) — Excel AW
- Missing required field (only possible for legacy/imported data once forms validate)
- `Possible duplicate REG-01 (same CAC)` — type REG-01, CAC not blank, another non-void REG-01 with the same CAC
- `No fee evidence with REG-01` — REG-01 and feeEvidenceAttached ≠ Y
- `Schedule 2 documents incomplete at receipt` — REG-01 and schedule2DocsAttached < 12
- `Related OGSERC number missing` — type ∈ {Update - material change, Annual confirmation, Deficiency response} and relatedOgsercNo blank
- `Not forwarded within target` — dateForwarded empty and workingDaysAtRegistry > registryForwardingTargetDays
- `Acknowledgement not yet issued` — ackIssuedVia = Not yet issued
- `Response overdue` — status Overdue
- `Closed after due date` — closedOn and responseDue set and closedOn > responseDue
- Excel-only flags not needed in the app: "Locked number differs from generated", "Our ref. not found", "File ref. not in File Index" (FKs make these impossible)
- **New:** `Schedule 2: 13 required for a multi-State licensee` — REG-01, docs = 12 and the user ticks "multi-State" (optional field; ask in Phase 0 whether to add)
- **New:** `Number year differs from deemed receipt year` (§3.2)

---

## 5. Outward items

### 5.1 Input fields (New Outward form)
| Field | Type | Default / notes |
|---|---|---|
| documentDate * | date | today |
| documentType * | OutgoingType | |
| subject * | text | |
| addressee * | text | |
| recipientCategory * | PartyCategory | |
| recipientContact | text | address / email |
| inReplyToInwardId | FK → InwardItem | UI shows the inward sender as a check (Excel col M) |
| relatedOgsercNo | text | registration / licence no. |
| fileId | FK → RegistryFile | |
| originatingUnit * | Unit | |
| preparedBy | text / User | |
| signedBy * | text / User | default = Secretary to the Commission (§9 R11) |
| signatoryDesignation | text | default `Secretary to the Commission` |
| dispatchMode * | ReceiptMode | |
| dateDispatched | date | blank if not yet sent |
| dispatchedBy | User | default logged-in officer; **cleared if dateDispatched is blank** (VBA) |
| trackingRef | text | |
| responseExpectedOverride | Y/N/blank | blank = type default |
| responseDueOverride | date | |
| remarks | text | |

Later (Update Item): dateDispatched, dispatchedBy, trackingRef, deliveryConfirmed (Y/N), dateDelivered, receivedByRecipient, responseExpectedOverride, responseDueOverride, remarks.

Guide rule: log the letter **before signature** to get its number, then quote the number on the document. The UI must show the number prominently right after save ("Quote this number on the document").

### 5.2 Derived fields
| Field | Rule (Excel col) |
|---|---|
| responseExpected | `responseExpectedOverride ?? OutgoingType.responseExpected` (AK) |
| responseDue | (AB) none if not dispatched; `responseDueOverride` if set; else if responseExpected → `addWorkingDays(dateDispatched, OutgoingType.responseWindowDays > 0 ? it : defaultResponseTargetDays)`; else none |
| responseInward | earliest non-void inward item with `inResponseToOutwardId = this` (AC; R3) |
| responseReceivedOn | its deemed receipt date (AD) |
| workingDaysToDispatch | `workingDaysBetween(documentDate, dateDispatched ?? today)` (AF) |

### 5.3 Status (in order; Excel AE)
1. `Void` (new)
2. `Not yet dispatched` — no dateDispatched
3. `Response received` — responseInward exists
4. `Response overdue` — responseDue set and today > responseDue
5. `Awaiting response` — responseDue set
6. `Delivered` — deliveryConfirmed = Y
7. `Dispatched`

### 5.4 Flags (Excel AG)
- `Not dispatched within target` — not dispatched and workingDaysToDispatch > dispatchTargetDays
- `Delivery not confirmed` — dispatched, deliveryConfirmed ≠ Y, dispatchMode ∉ noDeliveryConfirmationModes (Publication / gazette, Internal mail), and `workingDaysBetween(dateDispatched, today) > chaseProofOfDeliveryAfterDays`
- `Response overdue - follow up` — status Response overdue
- `Dispatched before document date`
- **New (validation, block instead of flag):** delivered date before dispatch date

---

## 6. Files

### 6.1 RegistryFile (File Index)
Fields: reference * (unique; e.g. `OGSERC/RL/002`, "must be new"), title *, fileClass, owningUnit, dateOpened (default today), currentVolume (default 1), security (default Open), fileStatus (default Open), dateClosedOrArchived, remarks.

Derived: inwardCount, outwardCount (non-void items linked), lastCorrespondence = max(inward deemed date, outward document date) of linked items; currentlyWith = holder of the latest movement if not returned, else `Registry` (format `{issuedTo} ({unit})`); outSince; workingDaysOut = `workingDaysBetween(outSince, today)`.

Flags: `Out beyond return date` (latest movement Overdue); `Correspondence after file closed` (status Closed/Archived and lastCorrespondence > dateClosedOrArchived). Duplicate reference / missing title are prevented by validation.

### 6.2 FileMovement
Fields: outAt * (timestamp = now, set by the system), file *, volume, releasedBy * (User), issuedTo * (text or User), unit, purpose, returnByOverride, dateReturned, receivedBackBy.

Derived: returnDue = `returnByOverride ?? addWorkingDays(date(outAt), fileReturnTargetDays)`; workingDaysOut = `workingDaysBetween(date(outAt), dateReturned ?? today)`; status = `Returned` if dateReturned, else `Overdue` if today > returnDue, else `Out`.

Validation (Excel flags → app rules): return date not before out date; a file with an unreturned movement can be issued again **only after explicit confirmation** ("{ref} is still out with {holder}. Issue it anyway?") — then flag `Earlier movement of this file not returned`.

---

## 7. Actions (from the VBA buttons)

Every action writes an audit entry (user, timestamp, action, before/after of changed fields).

| Button (VBA) | App action | Rules |
|---|---|---|
| SAVE TO REGISTER (`SaveInward`) | Create inward item | Validate required fields (message lists every missing field). Assign ACK number in the transaction. Success message: `Saved as {no}. Forward to: {routedUnit}`. Set the Desk's "slip for" selection to this number. Reset the form to defaults. |
| SAVE + PRINT SLIP / SAVE + PDF SLIP | Create + open slip PDF | Same, then open/download the slip (§8.1). File name `Slip {no}.pdf` (slashes → `-`). |
| CLEAR FORM | Reset form | Confirm if anything typed. |
| SAVE & GET NUMBER (`SaveOutward`) | Create outward item | Validate; clear dispatchedBy if no dispatch date; assign OUT number; message `Outward number: {no}. Quote it on the document.` |
| LOAD / SAVE CHANGES (Update Item) | Edit inward or outward | Edit only the fields listed in §4.1/§5.1 as "later". Show current status and due date read-only. After save, show the new status. |
| FORWARDED TODAY | Inward | Set dateForwarded = today if empty, save. |
| CLOSE TODAY | Inward | Confirm "Close {no} today without an outgoing letter?"; set dateClosedManual = today; set dateForwarded = today if empty. Require a closing note (new). |
| DISPATCHED TODAY | Outward | Set dateDispatched = today and dispatchedBy = current user if empty. |
| DELIVERED TODAY | Outward | Blocked with "Record the dispatch first" if not dispatched. Set deliveryConfirmed = Y, dateDelivered = today if empty. |
| ISSUE FILE | FileMovement create | Check for unreturned movement (§6.2). outAt = now. Message `{ref} issued to {to}. Return due {dd-MMM-yyyy}.` |
| RECORD RETURN | FileMovement update | Find the latest unreturned movement for the file; if none: `{ref} is not recorded as out. Nothing to return.` Set dateReturned = today, receivedBackBy. |
| ADD TO FILE INDEX | RegistryFile create | Reject if reference exists: `{ref} is already in the File Index.` |
| PRINT/SAVE SLIP | Slip PDF for chosen inward no. | Defaults to the latest item. |
| PRINT/SAVE DAILY REGISTER | Daily Register PDF | Date defaults to today; can choose another date. File `Daily Register {yyyy-mm-dd}.pdf`. |
| PRINT PENDING ACTIONS | Pending Actions PDF | Unit filter (All units or one unit). |
| LOCK ALL NUMBERS, CLEAR EXAMPLE ROWS, BACK UP WORKBOOK | **Not needed** | Numbers are immutable; no example data in production (seed examples only in dev/test); backups are database backups (document them in Phase R8). |

Registry Desk "Officer on duty" → the logged-in user. "Commission Secretary" → a setting (or the user holding the Secretary role) printed on slips and the Daily Register and used as default signatory.

---

## 8. Reports and screens

### 8.1 Acknowledgement slip (A4 portrait PDF, two copies on one page: "REGISTRANT'S / SENDER'S COPY" and "REGISTRY COPY", separated by a cut line)
Wording in `TEMPLATES.md`. Heading line depends on `IncomingType.para103SlipWording` (Y → para 10(3) wording, N → general wording). Fields: Inward/Ack No., date & time received, deemed receipt date, mode, Order reference, type, related OGSERC No., sender, sender's ref., subject, delivered/sent by, files/volumes, Schedule 2 documents, fee evidence attached, payment reference, amount (₦, thousands separators), received by, forwarded to. Blank values print as `—`. Signature line, official stamp box, "For the Secretary to the Commission ({name})".

### 8.2 Daily Register (date picker, default today)
- **Received**: inward items whose **actual receipt date** (date of receivedAt, not deemed) = chosen date, in receipt order. Columns: #, Inward No., time, mode, type, sender, subject, deemed receipt, received by, forward to.
- **Dispatched**: outward items with dateDispatched = chosen date. Columns per TEMPLATES.md.
- Counts at top ("Items received", "Items dispatched"); sign-off block for the officer and the Head of Registry.

### 8.3 Pending Actions (unit filter: All units or one unit)
Pending inward items (§4.3) in order received. Columns: #, Inward No., deemed receipt, sender, subject, type, unit, action officer, action, priority, response due, working days open, status. Counters: Pending, Overdue, Awaiting forwarding.

### 8.4 Dashboard
Incoming: items logged; received today; received last 7 days (receipt date in (today−7, today]); awaiting forwarding; forwarding overdue (flag); open; response overdue; closed; noted/filed; closed on time % (closed items with a due date); acknowledgements not yet issued; received after hours / non-working day (deemed ≠ receipt date); REG-01 filed after the registration deadline; items with flags.
Outgoing: items logged; dispatched today; dispatched last 7 days; not yet dispatched; dispatch overdue; delivery not confirmed; awaiting response; recipient response overdue; responses received; replies to inward items; items with flags.
Files: files in index; open files; files out with officers; files overdue; movements logged; files with flags.
Breakdowns: by unit (inward routed, open, overdue, closed, outward originated); incoming by category (received, open incl. awaiting forwarding, overdue) — use **one** definition of "open" in both tables (§9 R12); by month for 24 months from `dashboardFirstMonth` (inward by deemed date, outward by document date); by correspondent category (inward by sender category, outward by recipient category); outgoing by document type; incoming by type; incoming by principal LGA.
Registry Desk tiles: received today, dispatched today, awaiting forwarding, incoming overdue, not yet dispatched, replies overdue to us, files out.

Register screens: filterable, sortable tables (sorting is now safe — numbers don't depend on row order), status colour key from the Guide: red = overdue, amber = awaiting action, green = closed, peach = flagged. CSV export.

---

## 9. Excel problems — fix, don't copy

- **R1 Numbers depend on row order.** Generated numbers are `COUNTIF` of earlier rows; clearing a row (which the Guide tells users to do to remove an entry) renumbers every later unlocked row. → DB counter, immutable numbers, void instead of delete (§3.2).
- **R2 Links are typed text.** In Reply To, In Response to Our Ref., File Reference are typed numbers matched by text. → foreign keys chosen from a searchable picker.
- **R3 First match only.** `MATCH` returns the first row, so a second reply to the same inward item, or a second response to the same outward letter, is invisible. → one-to-many; show all linked items; rules in §4.2/§5.2 pick the earliest qualifying one.
- **R4 A holding reply closes the item.** Any outward item quoting the inward number closes it once dispatched, including "Acknowledgement / holding reply". → `OutgoingType.closesInwardItem` (false for holding reply; editable by admin).
- **R5 Registration deadline on a public holiday** (§2.2). → setting + open question Q1.
- **R6 TODAY() in formulas.** Status is recalculated on every open. → compute status at read time from stored facts and Lagos "today"; don't persist status as the source of truth. If you cache it for queries, recompute it nightly and on every write.
- **R7 Server time zone.** A UTC server shows yesterday's date between 00:00 and 01:00 Lagos time, and would mis-classify 17:00 Lagos cutoffs. → all date logic takes an explicit `now` in Africa/Lagos; tests inject `now`.
- **R8 Officer names are free text** (placeholders `[Registry officer 1]` etc.). → users with roles; "received by", "released by", "dispatched by" are the logged-in user by default.
- **R9 No audit trail.** → audit every create/update/void/close with before/after values.
- **R10 Update Item has no validation.** → block: forwarded/closed/dispatched before receipt or document date; delivered before dispatched; file returned before issued; future dates for receipt/dispatch/delivery.
- **R11 Signatory dropdown** only lists the Secretary but the hint says the Chairman or another officer may sign. → choose from users flagged as signatories, with free-text designation.
- **R12 Dashboard "Open" means different things** (unit table excludes Awaiting forwarding; category table includes it). → define `pending = Open + Overdue + Awaiting forwarding` and use it in both, labelled "Pending".
- **R13 Slip footer** always says the Commission "will decide a complete registration submission within thirty (30) days", even on a slip for a NERC letter or consumer complaint. → registration sentence only for registration filings (see TEMPLATES.md and Q4).
- **R14 1,000-row capacity** and "start a new workbook for the next period". → no limit.

---

## 10. Roles (capability-based, enforced on the server, deny by default)

| Role | Can |
|---|---|
| Registry officer | Log inward/outward; forward, close, dispatch, deliver; file desk; print slips and reports; view everything except files marked Confidential/Personnel. |
| Head of Registry | All of the above + void items (reason required), edit any field of any item, manage lists/types/holidays. |
| Unit officer | View pending and closed items routed to **their unit**; view outward items their unit originated. Read-only in v1 (Q5). |
| Secretary / management | Read-only everything; dashboard and reports. |
| Admin | Settings, users, roles. |

---

## 11. Open questions (make configurable; do not guess)

1. **Q1** Does the 60-day registration deadline roll forward when it lands on a non-working day (1 Jan 2027 with the placeholder Effective Date)? And the gazetted Effective Date itself.
2. **Q2** ACK serial: yearly restart (Registry workbook) or one global sequence (Registration workbook)? Ideally one answer for both apps.
3. **Q3** After-hours rule: only email/portal (Excel), or also courier/hand delivery accepted after 17:00?
4. **Q4** Which incoming types get the registration sentence on the slip? Proposal: REG-01, OUN-01, Deficiency response, Licence/permit application, Licence renewal.
5. **Q5** Should unit officers record forwarding receipt, action officer and manual close themselves, or does the Registry do everything (Excel)?
6. **Q6** Response targets in Lists are "internal service standards — set them to Commission policy." Confirm values.
7. **Q7** Real staff list, Secretary name, and who holds each role.
8. **Q8** Should scanned copies of incoming letters be uploaded and stored (new feature, Phase 7)? Size limit and retention.

---

## 12. Test fixtures (from the workbook's example rows plus edge cases)

Holidays = seed `publicHolidays`. Closing time 17:00. Times are Africa/Lagos.

### 12.1 Date engine
| # | Input | Expected |
|---|---|---|
| D1 | Hand delivery, Fri 20 Nov 2026 10:15 | deemed 20 Nov 2026 |
| D2 | Email, Mon 30 Nov 2026 18:40 | deemed Tue 1 Dec 2026 |
| D3 | Email, 30 Nov 2026 16:59 | deemed 30 Nov 2026 |
| D4 | Email, 30 Nov 2026 17:00 | deemed 1 Dec 2026 (17:00 is after hours) |
| D5 | Hand delivery, 30 Nov 2026 18:40 | deemed 30 Nov 2026 (Excel rule; Q3) |
| D6 | Hand delivery, Sat 5 Dec 2026 | deemed Mon 7 Dec 2026 |
| D7 | Email, Thu 24 Dec 2026 17:30 | deemed Tue 29 Dec 2026 (25 Dec, weekend, 28 Dec substitute holiday) |
| D8 | Email, Thu 31 Dec 2026 17:30 | deemed Mon 4 Jan 2027 → number series **2027** |
| D9 | addWorkingDays(20 Nov 2026, 20) | 18 Dec 2026 |
| D10 | addWorkingDays(23 Dec 2026, 1) | 24 Dec 2026 |
| D11 | workingDaysBetween(1 Dec 2026, 10 Dec 2026) | 7 |
| D12 | workingDaysBetween(20 Nov 2026, 25 Nov 2026) | 3 |
| D13 | Effective Date 2 Nov 2026 → registrationDeadline | 1 Jan 2027 (rollover off); 4 Jan 2027 (rollover on) |

### 12.2 Workbook example scenario (seed it in the test DB; evaluate "today" = **10 Dec 2026** unless stated)
Inward:
- **I1** `OGSERC/ACK/2026/00001` — REG-01, Sample Mini-Grid Ltd, hand delivery 20 Nov 2026 10:15, sender cat Registrant / licensee, CAC RC0000000, LGA Sagamu, 2 volumes, 12 Schedule 2 docs, fee Y, payref OGSERC-PAY-0001, ₦250,000, file OGSERC/RL/001, forwarded 20 Nov 2026 to Reg. Officer, ack via Printed slip, Action required, action officer Head, Registration.
  → deemed 20 Nov; category Regulatory filing; Order ref `11; Sch. 1 Pt A`; unit Registration & Licensing; due 18 Dec 2026; closed 25 Nov 2026 by O1; status **Closed**; closed on time; filed after deadline: No; workingDaysOpen 3; flags none.
- **I2** `OGSERC/ACK/2026/00002` — Deficiency response, email 30 Nov 2026 18:40, related OGSERC No. ACK/2026/00001, in response to O1, 1 doc, file OGSERC/RL/001, ack via Email, Action required, not forwarded.
  → deemed 1 Dec; due 15 Dec 2026; status **Awaiting forwarding**; workingDaysAtRegistry 7; flag `Not forwarded within target`. On **16 Dec 2026**: status **Overdue**, flags also `Response overdue`.
- **I3** `OGSERC/ACK/2026/00003` — Letter from NERC / Federal agency, hand delivery 2 Dec 2026 11:05, sender cat NERC, unit override Office of the Chairman, forwarded 2 Dec to PA to Chairman, ack Not required, Reply required, priority High, file OGSERC/GOV/001.
  → due 16 Dec 2026; closed 3 Dec 2026 by O2; **Closed**; on time.

Outward:
- **O1** `OGSERC/OUT/2026/00001` — Deficiency notice dated 25 Nov 2026, in reply to I1, unit Registration & Licensing, email, dispatched 25 Nov 2026, delivered Y 25 Nov 2026.
  → responseExpected Y (type default, 10 days); due 9 Dec 2026; response = I2 received 1 Dec 2026; status **Response received**.
- **O2** `OGSERC/OUT/2026/00002` — Letter to NERC / Federal agency dated 2 Dec 2026, in reply to I3, Office of the Chairman, signed Chairman, courier, dispatched 3 Dec 2026, delivery not confirmed.
  → no response expected; workingDaysToDispatch 1; status **Dispatched**; on 10 Dec no flag (5 working days since dispatch, not > 5); on **11 Dec 2026** flag `Delivery not confirmed`.

Files:
- **F1** OGSERC/RL/001 (Licensee file, Restricted) — movement M1 out 20 Nov 2026 14:00 to Reg. Officer, returned 25 Nov 2026 → returnDue 25 Nov; workingDaysOut 3; Returned. File: inward 2, outward 1, last correspondence 1 Dec 2026, currently with Registry.
- **F2** OGSERC/GOV/001 — movement M2 out 2 Dec 2026 to PA to Chairman (Office of the Chairman), not returned → returnDue 7 Dec 2026; on 10 Dec: **Overdue**, workingDaysOut 6; file currently with `PA to Chairman (Office of the Chairman)`, flag `Out beyond return date`.

Dashboard on 10 Dec 2026: inward logged 3; awaiting forwarding 1; closed 2; closed on time 100%; received after hours/non-working day 1; outward logged 2; responses received 1; replies to inward items 2; files out 1; files overdue 1.

### 12.3 New-rule fixtures
- **N1 (R4)** Add O3 "Acknowledgement / holding reply" in reply to I2, dispatched 2 Dec 2026 → I2 stays open. A later "Reply to correspondence" dispatched 8 Dec → I2 Closed 8 Dec.
- **N2 (R3)** Two inward responses quoting O1 (deemed 1 Dec and 3 Dec) → O1 response received 1 Dec; both listed.
- **N3 (§3.2)** 20 concurrent creates in 2026 → serials 00001–00020, no gaps, no duplicates.
- **N4** Voiding I2 → number kept, excluded from counts, next new item is 00004.
- **N5 (R7)** `now` = 10 Dec 2026 00:30 Lagos (9 Dec 23:30 UTC) → "today" is 10 Dec.
