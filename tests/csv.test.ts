import { expect, it } from "vitest";
import { toCsv } from "@/server/read/csv";

it("quotes, escapes and defuses formulas for Excel", () => {
  const csv = toCsv(
    [
      { a: 'He said "hi", twice', b: "=SUM(A1)" },
      { a: "line\nbreak", b: null },
    ],
    [
      { header: "Text", value: (r) => r.a },
      { header: "Other", value: (r) => r.b },
    ],
  );
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.slice(1)).toBe(
    'Text,Other\r\n"He said ""hi"", twice",\'=SUM(A1)\r\n"line\nbreak",\r\n',
  );
});
