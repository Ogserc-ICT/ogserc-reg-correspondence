/**
 * Parallel run: compare the workbook's daily counts with the app's.
 *
 *   npm run compare:workbook -- --file <workbook.xlsm> --from 2027-01-11 --to 2027-01-15
 *
 * Read-only. Prints one line per day and, for days that differ, the items on
 * each side. Exit code 1 if any day differs.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { isIsoDate } from "../src/domain/calendar";
import { formatDate } from "../src/domain/format";
import { createDb } from "../src/server/db";
import { compareDailyCounts, type DayLine } from "../src/server/import/compare";

const USAGE =
  "Usage: npm run compare:workbook -- --file <xlsm> --from YYYY-MM-DD --to YYYY-MM-DD";

function printList(title: string, items: DayLine[]) {
  if (!items.length) return;
  console.log(`    ${title}:`);
  for (const x of items)
    console.log(`      ${x.time ? `${x.time}  ` : ""}${x.who} — ${x.subject}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      "include-examples": { type: "boolean", default: false },
    },
  });
  const { file, from, to } = values;
  if (!file || !from || !to || !isIsoDate(from) || !isIsoDate(to))
    throw new Error(USAGE);

  const db = createDb(process.env.DATABASE_URL!);
  try {
    const result = await compareDailyCounts(db, {
      file,
      from,
      to,
      includeExamples: values["include-examples"],
    });
    console.log(
      "Date           Received (workbook / app)   Dispatched (workbook / app)",
    );
    for (const d of result) {
      const received = `${d.received.workbook} / ${d.received.app}`;
      const dispatched = `${d.dispatched.workbook} / ${d.dispatched.app}`;
      console.log(
        `${formatDate(d.date).padEnd(14)} ${received.padEnd(27)} ${dispatched.padEnd(12)} ${d.matches ? "match" : "DIFFERENT"}`,
      );
    }
    const different = result.filter((r) => !r.matches);
    for (const d of different) {
      console.log(`\n${formatDate(d.date)}`);
      printList("Received in the workbook", d.detail!.workbookReceived);
      printList("Received in the app", d.detail!.appReceived);
      printList("Dispatched in the workbook", d.detail!.workbookDispatched);
      printList("Dispatched in the app", d.detail!.appDispatched);
    }
    console.log(
      different.length
        ? `\n${different.length} day(s) differ.`
        : "\nEvery day matches.",
    );
    if (different.length) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
