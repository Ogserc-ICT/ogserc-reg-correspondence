# Phase 5 report

Branch `phase-5` (stacked on `phase-4`). Slips and reports.

## 1. What's built

| Output | Where to get it | Notes |
|---|---|---|
| Acknowledgement slip (A4 portrait, two copies, cut line ✂) | New Inward ("Save + print slip", "Save + PDF slip"); Registry Desk "slip for" box (defaults to the latest item); each inward item page | File name `Slip OGSERC-ACK-2026-00001.pdf` |
| Daily Register (A4 landscape) | `/daily`: pick a date (default today), check it on screen, Print or Save PDF | Received = actual receipt date in Lagos, in receipt order; dispatched = dispatch date, in number order; sign-off lines |
| Pending Actions (A4 landscape) | `/pending`: All units or one unit, Print or Save PDF | Pending / Overdue / Awaiting forwarding counters; overdue rows red, awaiting amber; deemed date then number |

**How the PDFs are made:**
- **Library:** `pdf-lib` on the server, with no Word or LibreOffice.
- **Fonts:** the slip uses DejaVu Sans Condensed, embedded and subset, because the built-in PDF fonts can't print `₦` or `✂`. The font files and their licence are in `assets/fonts/`.
- **Tables:** they repeat the header row on every page, never break a word or number, and print "Page n of m".
- **Wording:** what the slip says is a pure, tested function (`src/domain/slip.ts`).
  - The heading follows the type's para 10(3) setting.
  - The footer follows the type's footer kind: registration, para 10(3) or general.
  - The "5:00 p.m." comes from the closing time that applied when the item was received.

**Who can print:** registry officers, the Head of Registry and Secretary/management (`reports.print`). Unit officers and admins get a 403, and slips only open for items in the user's scope.

## 2. Done-when

All checked by reading the PDFs' text (pdf.js), in integration tests and in the browser test on data typed in through the UI:

- **I1 (REG-01) and I2 (Deficiency response):** para 10(3) heading and the registration footer.
- **I3 (NERC letter):** general heading and general footer, with no registration sentence.
- **Daily Register 20 Nov 2026:** I1 received, nothing dispatched.
- **Daily Register 2 Dec 2026:** I3 received, nothing dispatched. O2 is dated 2 Dec but dispatched on 3 Dec, so it isn't listed.
- **I2:** appears on 30 Nov (the day it arrived), not 1 Dec (its deemed day). A delivery at 23:30 UTC on 1 Dec is listed on 2 Dec (Lagos time).

`npm test`: 184 pass. `npm run test:e2e`: 12 pass.

## 3. Decisions to check

1. **Voided items are left off** the Daily Register and Pending Actions, as with every other count (SPEC §3.2).
2. **Daily Register sign-off is printed lines only (Q-C).** There's no in-app sign-off yet; it's easy to add if you want it.
3. **The slip's "5:00 p.m."** is the closing time saved with the item, not today's setting. A slip reprinted after the time changes still states the rule that applied.
4. **"Save + print slip"** opens the slip in a new tab for printing. If the browser blocks the pop-up, the success message has "print" and "save PDF" links.

## 4. Still needed from you

- **Q-A: the logo.** Put it in `assets/logo.png` (or `.jpg`) and the slip, Daily Register and Pending Actions print it automatically. Until then they print a text heading. SVG isn't supported by pdf-lib; send PNG.
- **Q4:** confirm which types get the registration footer. The current five come from TEMPLATES and are a setting per type.
- **Q-C:** in-app sign-off, or printed only?
