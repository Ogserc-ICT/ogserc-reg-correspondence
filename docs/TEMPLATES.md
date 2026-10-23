# Registry — Print Templates

All PDFs are generated on the server (`pdf-lib` or `@react-pdf/renderer`; no Word or LibreOffice). A4. Use the OGSERC logo in `assets/`. Dates `dd-MMM-yyyy` (e.g. `20-Nov-2026`), date-times `dd-MMM-yyyy HH:mm`, money `₦250,000`. Empty values print as `—`.

---

## 1. Acknowledgement slip (A4 portrait, two copies per page)

Top half and bottom half are identical except the copy label. Separate them with a dashed cut line and a ✂ symbol.

```
                    [logo]
        OGUN STATE ELECTRICITY REGULATORY COMMISSION
  Registry · 5th & 6th Floors, OPIC Building, Oke-Ilewo, Abeokuta
              {COPY LABEL}

                ACKNOWLEDGEMENT OF RECEIPT
                {HEADING LINE}

Inward / Ack. No.      {ackNo}                        (large, bold)
Date & time received   {receivedAt}      Deemed receipt date   {deemed}
Mode of receipt        {mode}            Order reference       {orderRef}
Type                   {type}            Related OGSERC No.    {relatedOgsercNo}
Sender                 {sender}          Sender's ref. no.     {senderRef}
Subject                {subject}
Delivered / sent by    {deliveredBy}     Files / volumes       {volumes}
Schedule 2 documents   {sch2}            Fee evidence attached {Y/N}
Payment reference      {paymentRef}      Amount shown (₦)      {amount}
Received by            {receivedBy}      Forwarded to          {routedUnit}

{FOOTER}

Registry officer's signature: ______________________     Official stamp: [ box ]
For the Secretary to the Commission ({secretaryName})
```

**COPY LABEL**: top = `REGISTRANT'S / SENDER'S COPY`; bottom = `REGISTRY COPY`.

**HEADING LINE**
- If `IncomingType.para103SlipWording = true`:
  `Paragraph 10(3), OGSERC Order on Commencement of Operations and Registration of Licensees and Electricity Operators, 2026`
- Otherwise:
  `Correspondence received by the Registry of the Ogun State Electricity Regulatory Commission`

**FOOTER** (Excel prints one static paragraph on every slip; SPEC §9 R13 splits it)
- Registration filings (the types in SPEC Q4 — until answered, use REG-01, OUN-01, Deficiency response, Licence / permit application, Licence renewal application):
  > This slip acknowledges receipt only. It is not a registration, licence or permit (para 11(3)). The Commission will decide a complete registration submission within thirty (30) days (para 13(1)) and will notify you of any missing information. Quote the acknowledgement number on all correspondence. Where you file electronically after 5:00 p.m. or on a non-working day, your filing is received on the next working day (para 10(3)).
- Other para 10(3) types:
  > This slip acknowledges receipt only. Quote the acknowledgement number on all correspondence. Where you file electronically after 5:00 p.m. or on a non-working day, your filing is received on the next working day (para 10(3)).
- All other correspondence:
  > This slip acknowledges receipt only. Please quote the acknowledgement number on all further correspondence with the Commission.

Keep the footer texts in settings or a template table so Legal can edit them without a deploy. The "5:00 p.m." must come from `settings.officeClosingTime`.

File name: `Slip OGSERC-ACK-2026-00001.pdf`.

---

## 2. Daily Register (A4 landscape)

```
OGSERC Registry — Daily Register                                Date: {dd-MMM-yyyy}
Items received: {n}        Items dispatched: {m}

RECEIVED
#  | Inward No. | Time | Mode | Type | Sender | Subject | Deemed receipt | Received by | Forward to

DISPATCHED
#  | Outward No. | Document type | Addressee | Subject | Dispatch mode | Tracking ref. | Dispatched by | Originating unit

Counted and checked against the physical items and dispatch book.
Registry officer: ____________________  Signature / date: __________
Head of Registry: ____________________  Signature / date: __________
For the Secretary to the Commission ({secretaryName})
```
Received = actual receipt date (not deemed). Order by receivedAt; dispatched ordered by number. Repeat table headers on each page; no blank rows. File name `Daily Register 2026-11-20.pdf`.

---

## 3. Pending Actions (A4 landscape)

```
OGSERC Registry — Pending Actions        Unit: {All units | unit}      Printed: {dd-MMM-yyyy HH:mm}
Pending: {n}     Overdue: {o}     Awaiting forwarding: {a}

# | Inward No. | Deemed receipt | Sender | Subject | Type | Unit | Action officer | Action | Priority | Response due | Working days open | Status
```
Overdue rows shaded red, Awaiting forwarding amber. Order by deemed receipt, then number.

---

## 4. On-screen messages (keep this wording; it is what registry staff already know)

- After saving inward: `Saved as {no}. Forward to: {unit}.`
- After saving outward: `Outward number: {no}. Quote it on the document.`
- Missing fields: `Please complete:` followed by each missing field label.
- Close without letter: `Close {no} today without an outgoing letter?`
- Delivered before dispatch: `Record the dispatch first (DISPATCHED TODAY).`
- File still out: `{ref} is still out with {holder}. Issue it anyway?`
- File issued: `{ref} issued to {to}. Return due {dd-MMM-yyyy}.`
- Nothing to return: `{ref} is not recorded as out. Nothing to return.`
- Duplicate file: `{ref} is already in the File Index.`
