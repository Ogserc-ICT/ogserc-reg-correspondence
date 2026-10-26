// The number service (SPEC §3.2, §3.3). Call it only inside the transaction
// that inserts the item: the counter row stays locked until that transaction
// ends, so concurrent saves queue, and a rollback gives the number back.
import { formatNumber, type Series } from "@/domain/numbering";
import type { Tx } from "./db";

export type AssignedNumber = { number: string; year: number; serial: number };

export async function nextNumber(
  series: Series,
  year: number,
  tx: Tx,
): Promise<AssignedNumber> {
  const settings = await tx.registrySettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { ackPrefix: true, outPrefix: true },
  });
  const [{ lastValue }] = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "NumberCounter" ("series", "year", "lastValue")
    VALUES (${series}::"Series", ${year}, 1)
    ON CONFLICT ("series", "year")
    DO UPDATE SET "lastValue" = "NumberCounter"."lastValue" + 1
    RETURNING "lastValue"`;
  const prefix = series === "ACK" ? settings.ackPrefix : settings.outPrefix;
  return {
    number: formatNumber(prefix, year, lastValue),
    year,
    serial: lastValue,
  };
}

/**
 * Moves a counter past a number that was issued elsewhere (workbook import,
 * STACK rule 19). Never moves it back.
 */
export async function advanceCounterTo(
  series: Series,
  year: number,
  serial: number,
  tx: Tx,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "NumberCounter" ("series", "year", "lastValue")
    VALUES (${series}::"Series", ${year}, ${serial})
    ON CONFLICT ("series", "year")
    DO UPDATE SET "lastValue" = GREATEST("NumberCounter"."lastValue", EXCLUDED."lastValue")`;
}
