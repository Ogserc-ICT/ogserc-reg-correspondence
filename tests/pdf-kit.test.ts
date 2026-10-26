// Tables flow across pages with the header repeated and no row split.
import { expect, it } from "vitest";
import { A4_LANDSCAPE, createDoc, pageNumbers, table } from "@/server/pdf/kit";
import { pdfPages } from "./pdf-text";

it("repeats the header row on every page and numbers the pages", async () => {
  const doc = await createDoc("test");
  const first = doc.pdf.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h]);
  const rows = Array.from({ length: 120 }, (_, i) => `Item ${i + 1}`);
  table(
    doc,
    { page: first, y: A4_LANDSCAPE.h - 40 },
    {
      x: 30,
      width: 780,
      bottom: 36,
      rows,
      newPage: () => ({
        page: doc.pdf.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h]),
        y: A4_LANDSCAPE.h - 40,
      }),
      columns: [
        { header: "Inward No.", width: 1, value: (r) => r },
        { header: "Amount", width: 1, value: () => "₦250,000 — ✂" },
      ],
    },
  );
  pageNumbers(doc);
  const pages = await pdfPages(await doc.pdf.save());
  expect(pages.length).toBeGreaterThan(1);
  for (const [i, p] of pages.entries()) {
    expect(p).toContain("Inward No. Amount");
    expect(p).toContain(`Page ${i + 1} of ${pages.length}`);
  }
  const all = pages.join(" ");
  for (const r of rows) expect(all).toContain(`${r} `);
  expect(all).toContain("₦250,000 — ✂");
});

it("never makes a column narrower than its longest word", async () => {
  const { fitWidths } = await import("@/server/pdf/kit");
  const w = fitWidths([1, 1, 8], [50, 10, 10], 100);
  expect(w[0]).toBe(50);
  expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  expect(w[1]).toBeGreaterThanOrEqual(10);
});
