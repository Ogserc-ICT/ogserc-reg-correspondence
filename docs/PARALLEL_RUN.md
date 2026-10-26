# Parallel run: one week with the workbook and the app

The last step before go-live (CLAUDE.md Phase 8): for one working week, log everything in **both** the workbook and the app, and compare the daily counts. The run passes when **every day of a full working week matches**.

## Before day 1

- [ ] The app is deployed as in [OPERATIONS.md](OPERATIONS.md), on its production database, with backups and scheduled jobs running.
- [ ] Every registry officer has an account, has signed in and changed their temporary password.
- [ ] Settings checked: Secretary's name, Effective Date, closing time, slip footers. The logo is in place.
- [ ] Types, response targets, units and holidays checked by the Head of Registry.
- [ ] Optional: import what's already in the workbook, so open items carry on in the app with their numbers:
  ```sh
  npm run import:workbook -- --file <workbook.xlsm> --as <head of registry email>            # dry run
  npm run import:workbook -- --file <workbook.xlsm> --as <head of registry email> --commit
  ```
  Read the dry-run report first: it lists anything it can't match (types, units, officer names).

## Each day

1. Log each item in both, as it arrives or leaves. The two systems number items separately during the run, so numbers will differ. That's expected.
2. At the end of the day, print the app's **Daily Register** and the workbook's, then run:
   ```sh
   npm run compare:workbook -- --file <workbook.xlsm> --from <today> --to <today>
   ```
   It prints, per day, items received (by the day they actually arrived) and dispatched in each. For any day that differs, it lists both sides' items.
3. Record the result below. If a day differs, find the missing or extra item, correct whichever side is wrong, and run the comparison again. In the app, a wrong entry is voided by the Head of Registry, not deleted.

| Day | Received (workbook / app) | Dispatched (workbook / app) | Match? | Notes / who checked |
|---|---|---|---|---|
| Mon | | | | |
| Tue | | | | |
| Wed | | | | |
| Thu | | | | |
| Fri | | | | |

At the end of the week, run the whole week in one go:

```sh
npm run compare:workbook -- --file <workbook.xlsm> --from <monday> --to <friday>
```

It ends with "Every day matches." (exit code 0) when the run passes.

## Also check during the week

- [ ] Slips print correctly: para 10(3) wording for filings, general wording for other letters; signed and stamped.
- [ ] Deemed receipt dates agree for after-hours emails and weekend items.
- [ ] Pending Actions agrees with the workbook's for at least one unit.
- [ ] Files issued and returned show the same "currently with".
- [ ] The Backup check job passed every morning, and one test restore was done (OPERATIONS.md §5).

## Cut-over

When the week passes:
1. Stop using the workbook on the agreed day. Keep a read-only copy.
2. If anything was logged only in the workbook, import it (dry run first).
3. From then on, the app's numbers are the only numbers.

If the week doesn't pass, keep both running, fix the causes, and run another full week.
