# Phase 6 report

Branch `phase-6` (stacked on `phase-5`). File Desk.

## 1. What's built

| Screen | Route | Notes |
|---|---|---|
| File Index | `/files` | Search, file status, owning unit, "Out with officers", "Overdue returns"; currently with, out since, days out, inward / outward counts, last correspondence, flags |
| Movements | `/files?view=movements` | Every movement, newest first; Out / Overdue / Returned |
| Add to File Index | `/files/new` | Defaults: today, volume 1, Open, Open. Duplicate: `{ref} is already in the File Index.` References are stored in capitals without spaces |
| File page | `/files/[id]` | Issue, Record return, Update details, movements, letters on the file, history |
| Desk | `/` | "Files out" tile links to the files that are out (red if any is overdue) |

**Rules (SPEC §6, TEMPLATES §4):**
- **Issue:** the time out is now. The message is `{ref} issued to {to}. Return due {dd-MMM-yyyy}.` Return due is 3 working days later unless overridden.
- **Issuing a file that's still out** first asks `{ref} is still out with {holder}. Issue it anyway?`. Only after "Issue anyway" is it issued, and that movement is flagged "Earlier movement of this file not returned". The question and the answer are both checked on the server.
- **Record return:** the latest unreturned movement comes back, today by default. If nothing is out: `{ref} is not recorded as out. Nothing to return.` A return can't be dated before the file went out or in the future (R10).
- **Closing a file:** a closed or archived file needs its closing date. Letters dated after it raise "Correspondence after file closed".
- **Permissions:** registry officers and the Head of Registry run the File Desk; Secretary/management can read it. Confidential and Personnel files are hidden from registry officers, even by direct link. Unit officers have no File Desk access.

## 2. Done-when: F1 and F2 through the UI

`e2e/scenario.spec.ts` does it all in a browser, as a registry officer, on the items entered in the Phase 4 test:
1. Issues OGSERC/RL/001 to "Reg. Officer" at 20 Nov 14:00 and returns it on 25 Nov.
2. Issues OGSERC/GOV/001 to "PA to Chairman" (Office of the Chairman) at 2 Dec 11:30.
3. On 10 Dec, checks on screen:
   - **F1:** with the Registry; 2 inward, 1 outward; last correspondence 01-Dec-2026; the movement was due 25-Nov, 3 working days out, Returned.
   - **F2:** with "PA to Chairman (Office of the Chairman)" since 02-Dec-2026, 6 working days; flagged "Out beyond return date"; the movement was due 07-Dec, Overdue.
   - **"Out with officers"** lists only GOV/001.
4. Issues GOV/001 again. The confirmation appears, and Cancel issues nothing. "Issue anyway" issues it, due 15-Dec-2026, and the new movement is flagged.

`npm test`: 199 pass. `npm run test:e2e`: 13 pass.

## 3. Things to know

1. **Moving the dev clock.** Time out is always "now", so the test has to move the clock between steps. `APP_NOW_FILE` (dev/test only) names a file the server reads its clock from on every request; the e2e run uses `.e2e-clock`. Like `APP_NOW`, the app refuses to start in production if it's set.
2. **Bug found and fixed:** after the "still out" question, "Issue anyway" sent the issue without the unit. React resets a form after each action, and a `<select>` falls back to its first default. The confirmation is now its own form that resends exactly what the server checked.
3. **Same fix everywhere:** every validation error now carries a fresh id the forms key on. A dropdown changed between two errors in a row is kept; there's an e2e test for it on New Inward.
4. **Staff can be named either way:** "Issued to" is free text, with an optional staff-member picker that fills in the name. Positions like "PA to Chairman" work as in the workbook.

## 4. Decisions to check

- Should a closed or archived file still be issued? Right now it can be (the workbook allowed it).
- The file reference can't be changed after it's added, because it's printed on letters. A wrong one is fixed by adding the right file and moving the letters to it.
