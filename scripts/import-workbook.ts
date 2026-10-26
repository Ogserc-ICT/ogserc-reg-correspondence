/**
 * Imports the Registry Correspondence Workbook (STACK rule 19).
 *
 *   npm run import:workbook -- --file <workbook.xlsm> --as <head-of-registry email>
 *   npm run import:workbook -- --file <workbook.xlsm> --as <email> --commit
 *
 * Without --commit it is a dry run: the full import runs and is rolled back,
 * and the report shows what would happen. --commit writes only if there are
 * no errors. Rows marked EXAMPLE are skipped unless --include-examples.
 * Safe to run again: anything already imported is skipped.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { appNow } from "../src/server/clock";
import { createDb } from "../src/server/db";
import {
  importWorkbook,
  type SheetReport,
} from "../src/server/import/workbook";
import { loadPrincipal } from "../src/server/session";

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      as: { type: "string" },
      commit: { type: "boolean", default: false },
      "include-examples": { type: "boolean", default: false },
    },
  });
  if (!values.file || !values.as)
    throw new Error(
      "Usage: npm run import:workbook -- --file <workbook.xlsm> --as <email> [--commit]",
    );
  const db = createDb(process.env.DATABASE_URL!);
  try {
    const head = await db.user.findUnique({
      where: { email: values.as.trim().toLowerCase() },
    });
    if (!head || head.role !== "HEAD_OF_REGISTRY" || !head.active)
      throw new Error(`${values.as} is not an active Head of Registry.`);
    const report = await importWorkbook(db, {
      file: values.file,
      as: await loadPrincipal(db, head.id),
      now: appNow(),
      commit: values.commit,
      includeExamples: values["include-examples"],
    });
    const line = (name: string, r: SheetReport) =>
      `  ${name.padEnd(16)} new ${String(r.created).padStart(4)}   already in the app ${String(r.skippedExisting).padStart(4)}   examples skipped ${r.skippedExamples}`;
    console.log(values.commit ? "Import" : "Dry run (nothing saved)");
    console.log(line("File Index", report.files));
    console.log(line("Inward Register", report.inward));
    console.log(line("Outward Register", report.outward));
    console.log(line("File Movement", report.movements));
    if (report.warnings.length)
      console.log(
        `\nWarnings (${report.warnings.length}):\n  ${report.warnings.join("\n  ")}`,
      );
    if (report.errors.length) {
      console.log(
        `\nErrors (${report.errors.length}) — nothing was saved:\n  ${report.errors.join("\n  ")}`,
      );
      process.exitCode = 1;
    } else if (values.commit)
      console.log(report.committed ? "\nSaved." : "\nNot saved.");
    else console.log("\nNo errors. Run again with --commit to save.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
