import ExcelJS from "exceljs";
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("reference/OGSERC_Registry_Correspondence_Workbook.xlsm");
  for (const ws of wb.worksheets) console.log(`${ws.name}: rows=${ws.rowCount} cols=${ws.columnCount}`);
  for (const name of ["Inward Register", "Outward Register", "File Index", "File Movement"]) {
    const ws = wb.getWorksheet(name);
    if (!ws) { console.log("MISSING", name); continue; }
    console.log(`\n== ${name}`);
    for (let r = 1; r <= 8; r++) {
      const vals = (ws.getRow(r).values as unknown[]).slice(1, 60).map((v) => {
        if (v && typeof v === "object") { const o = v as Record<string, unknown>; return "result" in o ? `=${String(o.result)}` : "richText" in o ? (o.richText as {text:string}[]).map(t=>t.text).join("") : JSON.stringify(o).slice(0,40); }
        return v instanceof Date ? v.toISOString() : v;
      });
      console.log(r, JSON.stringify(vals).slice(0, 1600));
    }
  }
})();
