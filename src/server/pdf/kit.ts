// pdf-lib building blocks for the slip and reports (TEMPLATES.md): Unicode
// fonts (₦, —, ✂), the optional logo, wrapped text and tables that repeat
// their header row on every page.
import fontkit from "@pdf-lib/fontkit";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";

export const A4 = { w: 595.28, h: 841.89 };
export const A4_LANDSCAPE = { w: 841.89, h: 595.28 };
export const INK = rgb(0.1, 0.1, 0.1);
export const GREY = rgb(0.4, 0.4, 0.4);
export const RULE = rgb(0.75, 0.75, 0.75);
/** Status shades from the workbook's Guide. */
export const SHADE = {
  overdue: rgb(0.99, 0.886, 0.882),
  awaiting: rgb(0.992, 0.941, 0.78),
};

const ASSETS = path.join(process.cwd(), "assets");
let fontBytes: { regular: Buffer; bold: Buffer } | null = null;

function loadFonts() {
  fontBytes ??= {
    regular: readFileSync(
      path.join(ASSETS, "fonts", "DejaVuSansCondensed.ttf"),
    ),
    bold: readFileSync(
      path.join(ASSETS, "fonts", "DejaVuSansCondensed-Bold.ttf"),
    ),
  };
  return fontBytes;
}

/** assets/logo.png (or .jpg) if someone has added it (Phase 0 Q-A). */
function logoFile(): { bytes: Buffer; kind: "png" | "jpg" } | null {
  for (const [name, kind] of [
    ["logo.png", "png"],
    ["logo.jpg", "jpg"],
    ["logo.jpeg", "jpg"],
  ] as const) {
    const p = path.join(ASSETS, name);
    if (existsSync(p)) return { bytes: readFileSync(p), kind };
  }
  return null;
}

export type Doc = {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
};

export async function createDoc(title: string): Promise<Doc> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title);
  pdf.setAuthor("OGSERC Registry");
  pdf.setCreator("OGSERC Registry System");
  const f = loadFonts();
  const regular = await pdf.embedFont(f.regular, { subset: true });
  const bold = await pdf.embedFont(f.bold, { subset: true });
  const l = logoFile();
  const logo = l
    ? await (l.kind === "png" ? pdf.embedPng(l.bytes) : pdf.embedJpg(l.bytes))
    : null;
  return { pdf, regular, bold, logo };
}

/** Splits text into lines no wider than `width`; long words are broken. */
export function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the column is broken by characters.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width)
          n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** Draws wrapped text from the top line's baseline; returns the y below it. */
export function paragraph(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    width: number;
    font: PDFFont;
    size: number;
    color?: RGB;
    leading?: number;
    align?: "left" | "center";
  },
): number {
  const leading = opts.leading ?? opts.size * 1.25;
  let y = opts.y;
  for (const line of wrap(text, opts.font, opts.size, opts.width)) {
    const w = opts.font.widthOfTextAtSize(line, opts.size);
    const x = opts.align === "center" ? opts.x + (opts.width - w) / 2 : opts.x;
    page.drawText(line, {
      x,
      y,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? INK,
    });
    y -= leading;
  }
  return y;
}

export type TableColumn<T> = {
  header: string;
  /** Share of the table width; columns are scaled to fit. */
  width: number;
  value: (row: T, index: number) => string;
};

/**
 * A table that flows across pages. The header row repeats on each new page
 * (TEMPLATES §2) and rows are never split. `newPage` must return a fresh page
 * and the y to start at.
 */
export function table<T>(
  doc: Doc,
  start: { page: PDFPage; y: number },
  opts: {
    x: number;
    width: number;
    bottom: number;
    columns: TableColumn<T>[];
    rows: readonly T[];
    size?: number;
    shade?: (row: T) => RGB | null;
    newPage: () => { page: PDFPage; y: number };
  },
): { page: PDFPage; y: number } {
  const size = opts.size ?? 7.5;
  const pad = 2.5;
  const leading = size * 1.2;
  const widths = fitWidths(
    opts.columns.map((c) => c.width),
    opts.columns.map(
      (c, i) =>
        Math.max(
          longestWord(c.header, doc.bold, size),
          ...opts.rows.map((r, j) =>
            longestWord(c.value(r, j), doc.regular, size),
          ),
        ) +
        2 * pad +
        1,
    ),
    opts.width,
  );
  let { page, y } = start;

  const cellsOf = (values: string[], font: PDFFont) =>
    values.map((v, i) => wrap(v, font, size, widths[i] - 2 * pad));

  const drawRow = (lines: string[][], font: PDFFont, fill: RGB | null) => {
    const h = Math.max(...lines.map((l) => l.length)) * leading + 2 * pad;
    if (fill)
      page.drawRectangle({
        x: opts.x,
        y: y - h,
        width: opts.width,
        height: h,
        color: fill,
      });
    let x = opts.x;
    lines.forEach((cell, i) => {
      cell.forEach((text, j) =>
        page.drawText(text, {
          x: x + pad,
          y: y - pad - size - j * leading + 1.5,
          size,
          font,
          color: INK,
        }),
      );
      x += widths[i];
    });
    page.drawLine({
      start: { x: opts.x, y: y - h },
      end: { x: opts.x + opts.width, y: y - h },
      thickness: 0.4,
      color: RULE,
    });
    y -= h;
  };

  const headerLines = cellsOf(
    opts.columns.map((c) => c.header),
    doc.bold,
  );
  const headerHeight =
    Math.max(...headerLines.map((l) => l.length)) * leading + 2 * pad;
  const header = () => drawRow(headerLines, doc.bold, rgb(0.93, 0.93, 0.93));
  header();

  opts.rows.forEach((row, i) => {
    const lines = cellsOf(
      opts.columns.map((c) => c.value(row, i)),
      doc.regular,
    );
    const h = Math.max(...lines.map((l) => l.length)) * leading + 2 * pad;
    if (y - h < opts.bottom) {
      ({ page, y } = opts.newPage());
      if (y - headerHeight - h >= opts.bottom) header();
    }
    drawRow(lines, doc.regular, opts.shade?.(row) ?? null);
  });
  return { page, y };
}

function longestWord(text: string, font: PDFFont, size: number): number {
  return Math.max(
    0,
    ...text.split(/\s+/).map((w) => font.widthOfTextAtSize(w, size)),
  );
}

/**
 * Column widths in proportion to `shares`, but never narrower than `mins`
 * (the longest word in the column), so dates and numbers never break. Space
 * for the raised columns comes from the others, in proportion.
 */
export function fitWidths(
  shares: number[],
  mins: number[],
  total: number,
): number[] {
  const fixed = new Set<number>();
  for (;;) {
    const freeShare = shares.reduce((s, x, i) => (fixed.has(i) ? s : s + x), 0);
    const fixedWidth = mins.reduce((s, m, i) => (fixed.has(i) ? s + m : s), 0);
    const widths = shares.map((x, i) =>
      fixed.has(i) ? mins[i] : (x / freeShare) * (total - fixedWidth),
    );
    const short = widths.findIndex((w, i) => !fixed.has(i) && w < mins[i]);
    if (short === -1 || fixed.size === shares.length - 1) return widths;
    fixed.add(short);
  }
}

/** "Page n of m" on every page, once the document is complete. */
export function pageNumbers(doc: Doc, size = 7) {
  const pages = doc.pdf.getPages();
  pages.forEach((p, i) => {
    const text = `Page ${i + 1} of ${pages.length}`;
    const w = doc.regular.widthOfTextAtSize(text, size);
    p.drawText(text, {
      x: p.getWidth() - 36 - w,
      y: 18,
      size,
      font: doc.regular,
      color: GREY,
    });
  });
}
