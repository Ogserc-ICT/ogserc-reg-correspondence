// Text of each page of a PDF, for asserting what was printed.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: false })
    .promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(
      content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  await doc.destroy();
  return pages;
}
