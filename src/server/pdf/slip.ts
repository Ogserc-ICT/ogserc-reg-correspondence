// Acknowledgement slip: A4 portrait, two identical copies (sender's and
// Registry's) separated by a dashed cut line with ✂ (TEMPLATES §1).
import type { PDFPage } from "pdf-lib";
import { COPY_LABELS, type SlipContent } from "@/domain/slip";
import { A4, createDoc, GREY, INK, paragraph, RULE, type Doc } from "./kit";

const MARGIN = 40;
const HALF = A4.h / 2;

function drawCopy(
  doc: Doc,
  page: PDFPage,
  c: SlipContent,
  label: string,
  top: number,
) {
  const width = A4.w - 2 * MARGIN;
  let y = top - 22;

  if (doc.logo) {
    const h = 30;
    const w = (doc.logo.width / doc.logo.height) * h;
    page.drawImage(doc.logo, {
      x: (A4.w - w) / 2,
      y: y - h + 8,
      width: w,
      height: h,
    });
    y -= h + 2;
  }
  y = paragraph(page, c.commission, {
    x: MARGIN,
    y,
    width,
    font: doc.bold,
    size: 11,
    align: "center",
  });
  y = paragraph(page, c.address, {
    x: MARGIN,
    y: y + 2,
    width,
    font: doc.regular,
    size: 7.5,
    color: GREY,
    align: "center",
  });
  y = paragraph(page, label, {
    x: MARGIN,
    y: y - 1,
    width,
    font: doc.bold,
    size: 8,
    color: GREY,
    align: "center",
  });
  y = paragraph(page, c.title, {
    x: MARGIN,
    y: y - 4,
    width,
    font: doc.bold,
    size: 12,
    align: "center",
  });
  y = paragraph(page, c.heading, {
    x: MARGIN + 30,
    y: y + 1,
    width: width - 60,
    font: doc.regular,
    size: 7.5,
    align: "center",
  });

  // The number, large and bold.
  y -= 8;
  page.drawText("Inward / Ack. No.", {
    x: MARGIN,
    y,
    size: 8,
    font: doc.regular,
    color: GREY,
  });
  page.drawText(c.number, {
    x: MARGIN + 110,
    y: y - 3,
    size: 15,
    font: doc.bold,
    color: INK,
  });
  y -= 20;

  const col = width / 2;
  const labelW = 98;
  for (const line of c.lines) {
    let lineBottom = y;
    line.forEach(([labelText, value], i) => {
      const x = MARGIN + i * col;
      const valueWidth = (line.length === 1 ? width : col) - labelW - 6;
      page.drawText(labelText, {
        x,
        y,
        size: 7.5,
        font: doc.regular,
        color: GREY,
      });
      const after = paragraph(page, value, {
        x: x + labelW,
        y,
        width: valueWidth,
        font: doc.regular,
        size: 8.5,
        leading: 10,
      });
      lineBottom = Math.min(lineBottom, after);
    });
    y = lineBottom - 3;
  }

  y = paragraph(page, c.footer, {
    x: MARGIN,
    y: y - 4,
    width,
    font: doc.regular,
    size: 7.5,
    leading: 9.5,
  });

  // Signature, stamp box and "For the Secretary".
  const stampW = 110;
  const stampH = 42;
  const sigY = Math.max(y - 16, top - HALF + 34);
  page.drawText(c.signatureLine, {
    x: MARGIN,
    y: sigY,
    size: 8,
    font: doc.regular,
    color: INK,
  });
  page.drawText(c.forSecretary, {
    x: MARGIN,
    y: sigY - 14,
    size: 8,
    font: doc.regular,
    color: INK,
  });
  page.drawText("Official stamp:", {
    x: A4.w - MARGIN - stampW - 62,
    y: sigY,
    size: 8,
    font: doc.regular,
    color: INK,
  });
  page.drawRectangle({
    x: A4.w - MARGIN - stampW,
    y: sigY - stampH + 10,
    width: stampW,
    height: stampH,
    borderColor: RULE,
    borderWidth: 0.8,
  });
}

export async function slipPdf(c: SlipContent): Promise<Uint8Array> {
  const doc = await createDoc(`Acknowledgement slip ${c.number}`);
  const page = doc.pdf.addPage([A4.w, A4.h]);
  drawCopy(doc, page, c, COPY_LABELS[0], A4.h);

  // Cut line.
  page.drawLine({
    start: { x: 20, y: HALF },
    end: { x: A4.w - 20, y: HALF },
    thickness: 0.6,
    color: GREY,
    dashArray: [4, 3],
  });
  page.drawText("✂", {
    x: 24,
    y: HALF - 4,
    size: 11,
    font: doc.regular,
    color: GREY,
  });

  drawCopy(doc, page, c, COPY_LABELS[1], HALF);
  return doc.pdf.save();
}
