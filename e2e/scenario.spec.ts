// Phase 4 acceptance: the SPEC §12.2 workbook scenario entered through the
// UI by a registry officer, with every computed value checked on screen.
// The app clock is 10 Dec 2026 09:00 Lagos (playwright.config APP_NOW).
import { expect, test, type Page } from "@playwright/test";
import { HEADING_GENERAL, HEADING_PARA103 } from "../src/domain/slip";
import { pdfPages } from "../tests/pdf-text";
import { DEV_PASSWORD, setClock } from "./env";

// Next keeps the previous page in the DOM as a hidden Activity, so every
// locator is limited to visible elements.
const field = (page: Page, name: string) =>
  page.locator(`[name="${name}"]:visible`);

/** Opens the forms' fold-out groups so every field can be filled. */
async function openFolds(page: Page) {
  // The form streams in after the page shell; wait for it first.
  await page.locator("main form").first().waitFor();
  await page.evaluate(() =>
    document.querySelectorAll("main form details").forEach((d) => {
      (d as HTMLDetailsElement).open = true;
    }),
  );
}

async function fill(page: Page, values: Record<string, string>) {
  await openFolds(page);
  // New Inward takes the date and time received in one picker.
  const { receivedDate, receivedTime, ...rest } = values;
  if (receivedDate || receivedTime) {
    const when = page.locator('input[type="datetime-local"]:visible');
    const [date, time] = (await when.inputValue()).split("T");
    await when.fill(`${receivedDate ?? date}T${receivedTime ?? time}`);
  }
  for (const [name, value] of Object.entries(rest))
    await field(page, name).fill(value);
}

async function choose(page: Page, values: Record<string, string>) {
  await openFolds(page);
  for (const [name, label] of Object.entries(values)) {
    const control = field(page, name).first();
    if ((await control.getAttribute("type")) === "radio")
      // Priority is a row of buttons (labels around hidden radios).
      await page
        .locator("label:visible", {
          has: page.locator(`input[name="${name}"]`),
          hasText: new RegExp(`^${label}$`),
        })
        .click();
    else await control.selectOption({ label });
  }
}

async function pick(page: Page, label: string, search: string, result: RegExp) {
  await openFolds(page);
  await page.getByRole("searchbox", { name: `Search ${label}` }).fill(search);
  await page.getByRole("option").getByRole("button", { name: result }).click();
}

const flagList = (page: Page) =>
  page.getByRole("list", { name: "Flags" }).filter({ visible: true });

const status = (page: Page) => page.locator("[role=status]:visible");

/** The value shown next to a label on an item page. */
const detail = (page: Page, label: string) =>
  page
    .locator("dt:visible", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following-sibling::dd");

async function openSaved(page: Page) {
  await status(page).getByRole("link").click();
  await page.waitForURL(/\/(inward|outward)\/[0-9a-f-]{36}$/);
}

test("SPEC §12.2 entered through the UI matches the fixtures", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto("/login");
  await page
    .getByLabel("Email address")
    .fill("registry.officer1@example.invalid");
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  // ---- I1: REG-01 by hand, 20 Nov 2026 10:15 --------------------------------
  await page.goto("/inward/new");
  await fill(page, {
    receivedDate: "2026-11-20",
    receivedTime: "10:15",
    sender: "Sample Mini-Grid Ltd",
    subject: "Registration of mini-grid operator",
    cacNo: "RC0000000",
    volumes: "2",
    schedule2DocsAttached: "12",
    paymentRef: "OGSERC-PAY-0001",
    amountShown: "250,000",
    actionOfficer: "Head, Registration",
  });
  await choose(page, {
    modeId: "Hand delivery",
    typeId: "REG-01 Registration (new)",
    senderCategoryId: "Registrant / licensee",
    principalLgaId: "Sagamu",
    feeEvidenceAttached: "Yes",
    actionRequiredId: "Action required",
  });
  await pick(page, "File", "RL/001", /OGSERC\/RL\/001/);
  await page.getByRole("button", { name: "Save to register" }).click();
  await expect(status(page)).toContainText(
    "Saved as OGSERC/ACK/2026/00001. Forward to: Registration & Licensing.",
  );
  await openSaved(page);
  await fill(page, {
    dateForwarded: "2026-11-20",
    receivedByUnitOfficer: "Reg. Officer",
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(status(page)).toContainText("OGSERC/ACK/2026/00001 updated.");

  // ---- O1: Deficiency notice, 25 Nov, in reply to I1 ------------------------
  await page.goto("/outward/new");
  await fill(page, {
    documentDate: "2026-11-25",
    subject: "Deficiency notice: registration of mini-grid operator",
    addressee: "Sample Mini-Grid Ltd",
    dateDispatched: "2026-11-25",
  });
  await choose(page, {
    typeId: "Deficiency notice",
    originatingUnitId: "Registration & Licensing",
    recipientCategoryId: "Registrant / licensee",
    dispatchModeId: "Email",
  });
  await pick(page, "In reply to", "ACK/2026/00001", /OGSERC\/ACK\/2026\/00001/);
  await pick(page, "File", "RL/001", /OGSERC\/RL\/001/);
  await page.getByRole("button", { name: "Save & get number" }).click();
  await expect(status(page)).toContainText("OGSERC/OUT/2026/00001");
  await expect(status(page)).toContainText("Quote it on the document.");
  await status(page).getByRole("link", { name: "Open the record" }).click();
  await page.waitForURL(/\/outward\/[0-9a-f-]{36}$/);
  await choose(page, { deliveryConfirmed: "Yes" });
  await fill(page, { dateDelivered: "2026-11-25" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(status(page)).toContainText("OGSERC/OUT/2026/00001 updated.");

  // ---- I2: Deficiency response by email, 30 Nov 18:40 -----------------------
  await page.goto("/inward/new");
  await fill(page, {
    receivedDate: "2026-11-30",
    receivedTime: "18:40",
    sender: "Sample Mini-Grid Ltd",
    subject: "Response to deficiency notice",
    relatedOgsercNo: "ACK/2026/00001",
    schedule2DocsAttached: "1",
  });
  await choose(page, {
    modeId: "Email",
    typeId: "Deficiency response",
    senderCategoryId: "Registrant / licensee",
    ackIssuedViaId: "Email",
    actionRequiredId: "Action required",
  });
  await pick(
    page,
    "In response to our ref.",
    "OUT/2026/00001",
    /OGSERC\/OUT\/2026\/00001/,
  );
  await pick(page, "File", "RL/001", /OGSERC\/RL\/001/);
  await page.getByRole("button", { name: "Save to register" }).click();
  await expect(status(page)).toContainText(
    "Saved as OGSERC/ACK/2026/00002. Forward to: Registration & Licensing.",
  );

  // ---- I3: NERC letter by hand, 2 Dec 11:05, to the Chairman ----------------
  await page.goto("/inward/new");
  await fill(page, {
    receivedDate: "2026-12-02",
    receivedTime: "11:05",
    sender: "Nigerian Electricity Regulatory Commission",
    subject: "Transition arrangements",
  });
  await choose(page, {
    modeId: "Hand delivery",
    typeId: "Letter from NERC / Federal agency",
    senderCategoryId: "NERC",
    unitOverrideId: "Office of the Chairman",
    ackIssuedViaId: "Not required",
    actionRequiredId: "Reply required",
    priorityId: "High",
  });
  await pick(page, "File", "GOV/001", /OGSERC\/GOV\/001/);
  await page.getByRole("button", { name: "Save to register" }).click();
  await expect(status(page)).toContainText(
    "Saved as OGSERC/ACK/2026/00003. Forward to: Office of the Chairman.",
  );
  await openSaved(page);
  await fill(page, {
    dateForwarded: "2026-12-02",
    receivedByUnitOfficer: "PA to Chairman",
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(status(page)).toContainText("updated.");

  // ---- O2: Letter to NERC, 2 Dec, signed by the Chairman, courier 3 Dec ------
  await page.goto("/outward/new");
  await fill(page, {
    documentDate: "2026-12-02",
    subject: "Re: transition arrangements",
    addressee: "Nigerian Electricity Regulatory Commission",
    signatoryDesignation: "",
    dateDispatched: "2026-12-03",
  });
  await choose(page, {
    typeId: "Letter to NERC / Federal agency",
    originatingUnitId: "Office of the Chairman",
    recipientCategoryId: "NERC",
    signedById: "Chairman (Chairman)",
    dispatchModeId: "Courier",
  });
  await pick(page, "In reply to", "ACK/2026/00003", /OGSERC\/ACK\/2026\/00003/);
  await pick(page, "File", "GOV/001", /OGSERC\/GOV\/001/);
  await page.getByRole("button", { name: "Save & get number" }).click();
  await expect(status(page)).toContainText("OGSERC/OUT/2026/00002");

  // ==== Checks on 10 Dec 2026 =================================================
  await page.goto("/inward");
  const row = (no: string) => page.getByRole("row", { name: new RegExp(no) });
  await expect(row("ACK/2026/00001")).toContainText("20-Nov-2026");
  await expect(row("ACK/2026/00001")).toContainText("18-Dec-2026");
  await expect(row("ACK/2026/00001")).toContainText("Closed");
  await expect(row("ACK/2026/00002")).toContainText("01-Dec-2026"); // deemed
  await expect(row("ACK/2026/00002")).toContainText("15-Dec-2026");
  await expect(row("ACK/2026/00002")).toContainText("Awaiting forwarding");
  await expect(row("ACK/2026/00002")).toContainText(
    "Not forwarded within target",
  );
  await expect(row("ACK/2026/00003")).toContainText("16-Dec-2026");
  await expect(row("ACK/2026/00003")).toContainText("Office of the Chairman");
  await expect(row("ACK/2026/00003")).toContainText("Closed");

  // I1 in full.
  await row("ACK/2026/00001").getByRole("link").click();
  await expect(detail(page, "Deemed receipt date")).toHaveText("20-Nov-2026");
  await expect(detail(page, "Category")).toHaveText("Regulatory filing");
  await expect(detail(page, "Order reference")).toHaveText("11; Sch. 1 Pt A");
  await expect(detail(page, "Forward to")).toHaveText(
    "Registration & Licensing",
  );
  await expect(detail(page, "Response due")).toHaveText("18-Dec-2026");
  await expect(detail(page, "Closed on")).toContainText(
    "25-Nov-2026 (by OGSERC/OUT/2026/00001)",
  );
  await expect(detail(page, "Closed on time")).toHaveText("Yes");
  await expect(detail(page, "Filed after registration deadline")).toHaveText(
    "No",
  );
  await expect(detail(page, "Working days open")).toHaveText("3");
  await expect(detail(page, "Amount shown")).toHaveText("₦250,000");
  await expect(flagList(page)).toHaveCount(0);

  // I2: 7 working days at the Registry, flagged.
  await page.goto("/inward");
  await row("ACK/2026/00002").getByRole("link").click();
  await expect(detail(page, "Deemed receipt date")).toHaveText("01-Dec-2026");
  await expect(detail(page, "Working days at Registry")).toHaveText("7");

  // I3 closed on time by O2.
  await page.goto("/inward");
  await row("ACK/2026/00003").getByRole("link").click();
  await expect(detail(page, "Closed on")).toContainText(
    "03-Dec-2026 (by OGSERC/OUT/2026/00002)",
  );
  await expect(detail(page, "Closed on time")).toHaveText("Yes");

  // O1: response expected, due 9 Dec, answered by I2.
  await page.goto("/outward");
  await row("OUT/2026/00001").getByRole("link").click();
  await expect(detail(page, "Response expected")).toHaveText("Yes");
  await expect(detail(page, "Response due")).toHaveText("09-Dec-2026");
  await expect(detail(page, "Response received")).toHaveText(
    "OGSERC/ACK/2026/00002 on 01-Dec-2026",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Response received",
  );

  // O2: dispatched, no response expected, 1 working day to dispatch, no flag yet.
  await page.goto("/outward");
  await expect(row("OUT/2026/00002")).toContainText("Dispatched");
  await row("OUT/2026/00002").getByRole("link").click();
  await expect(detail(page, "Response expected")).toHaveText("No");
  await expect(detail(page, "Working days to dispatch")).toHaveText("1");
  await expect(detail(page, "Signed by")).toContainText("Chairman");
  await expect(flagList(page)).toHaveCount(0);

  // Registry Desk on 10 Dec.
  await page.goto("/");
  const tile = (label: string) =>
    page.locator("main a:visible, main div:visible", { hasText: label }).last();
  await expect(tile("Awaiting forwarding")).toContainText("1");
  await expect(tile("Incoming overdue")).toContainText("0");
});

test("a missing field lists every gap and keeps what was typed", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("Email address")
    .fill("registry.officer1@example.invalid");
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/");

  await page.goto("/inward/new");
  await fill(page, { sender: "Typed sender", receivedTime: "09:30" });
  await page.getByRole("button", { name: "Save to register" }).click();
  const alert = page.locator("form [role=alert]:visible");
  await expect(alert).toContainText("Please complete:");
  await expect(alert).toContainText("Mode of receipt");
  await expect(alert).toContainText("Subject");
  await expect(alert).toContainText(
    "Date & time received can't be in the future.",
  );
  await expect(field(page, "sender")).toHaveValue("Typed sender");

  // A second error in a row keeps a dropdown changed in between.
  await choose(page, { modeId: "Courier" });
  await page.getByRole("button", { name: "Save to register" }).click();
  await expect(alert).toContainText("Subject");
  await expect(field(page, "modeId")).toHaveValue(
    (await field(page, "modeId")
      .locator("option", { hasText: "Courier" })
      .getAttribute("value")) ?? "",
  );
  await expect(field(page, "sender")).toHaveValue("Typed sender");
});

// ---- Phase 5: slips and reports on the data entered above ------------------

async function signInAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

async function pdfText(page: Page, url: string) {
  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  return (await pdfPages(new Uint8Array(await res.body()))).join(" ");
}

test("slips for I1–I3 carry the right heading and footer", async ({ page }) => {
  await signInAs(page, "registry.officer1@example.invalid");
  const slip = (no: string) =>
    pdfText(page, `/slip?no=${encodeURIComponent(no)}`);

  const i1 = await slip("OGSERC/ACK/2026/00001");
  expect(i1).toContain(HEADING_PARA103);
  expect(i1).toContain("It is not a registration, licence or permit");
  expect(i1).toContain("REGISTRANT'S / SENDER'S COPY");
  expect(i1).toContain("REGISTRY COPY");
  expect(i1).toContain("₦250,000");

  const i2 = await slip("OGSERC/ACK/2026/00002");
  expect(i2).toContain(HEADING_PARA103);
  expect(i2).toContain("It is not a registration, licence or permit");

  const i3 = await slip("OGSERC/ACK/2026/00003");
  expect(i3).toContain(HEADING_GENERAL);
  expect(i3).toContain(
    "Please quote the acknowledgement number on all further correspondence",
  );
  expect(i3).not.toContain("registration");
});

test("Daily Registers for 20 Nov and 2 Dec 2026 list the right items", async ({
  page,
}) => {
  await signInAs(page, "registry.officer1@example.invalid");
  const nov20 = await pdfText(page, "/daily/pdf?date=2026-11-20");
  expect(nov20).toContain("Items received: 1");
  expect(nov20).toContain("OGSERC/ACK/2026/00001");
  expect(nov20).toContain("Items dispatched: 0");

  const dec2 = await pdfText(page, "/daily/pdf?date=2026-12-02");
  expect(dec2).toContain("Items received: 1");
  expect(dec2).toContain("OGSERC/ACK/2026/00003");
  expect(dec2).not.toContain("OGSERC/OUT/2026/00002"); // dispatched on 3 Dec
  expect(dec2).toContain("Items dispatched: 0");

  // The screen agrees with the PDF.
  await page.goto("/daily?date=2026-11-30");
  await expect(page.locator("main:visible")).toContainText(
    "OGSERC/ACK/2026/00002",
  );
  await expect(page.locator("main:visible")).toContainText("Items received: 1");

  const pending = await pdfText(page, "/pending/pdf");
  expect(pending).toContain("Pending: 1");
  expect(pending).toContain("OGSERC/ACK/2026/00002");
});

test("unit officers can't print reports", async ({ page }) => {
  await signInAs(page, "unit.registration@example.invalid");
  expect((await page.request.get("/daily/pdf")).status()).toBe(403);
  expect(
    (await page.request.get("/slip?no=OGSERC/ACK/2026/00001")).status(),
  ).toBe(403);
  await page.goto("/pending");
  await expect(
    page.getByRole("heading", { name: "You can't open this page" }),
  ).toBeVisible();
});

// ---- Phase 6: File Desk — F1 and F2 through the UI -------------------------

test("F1 and F2 through the File Desk, with 'issue anyway?'", async ({
  page,
}) => {
  test.setTimeout(180_000);
  try {
    await signInAs(page, "registry.officer1@example.invalid");
    const openFile = async (ref: string) => {
      await page.goto("/files");
      await page.getByRole("link", { name: ref }).click();
      await page.waitForURL(/\/files\/[0-9a-f-]{36}$/);
    };
    const issue = async (to: string, unitLabel: string) => {
      await fill(page, { issuedTo: to });
      await choose(page, { unitId: unitLabel });
      await page.getByRole("button", { name: "Issue file" }).click();
    };

    // M1: RL/001 out 20 Nov 14:00 to Reg. Officer, back 25 Nov.
    setClock("2026-11-20T14:00");
    await openFile("OGSERC/RL/001");
    await issue("Reg. Officer", "Registration & Licensing");
    await expect(status(page)).toContainText(
      "OGSERC/RL/001 issued to Reg. Officer. Return due 25-Nov-2026.",
    );

    setClock("2026-11-25T10:00");
    await page.reload();
    await page
      .getByRole("button", { name: /Record return from Reg\. Officer/ })
      .click();
    await expect(status(page)).toContainText(
      "OGSERC/RL/001 returned to the Registry from Reg. Officer (Registration & Licensing).",
    );

    // M2: GOV/001 out 2 Dec to PA to Chairman, not returned.
    setClock("2026-12-02T11:30");
    await openFile("OGSERC/GOV/001");
    await issue("PA to Chairman", "Office of the Chairman");
    await expect(status(page)).toContainText(
      "OGSERC/GOV/001 issued to PA to Chairman. Return due 07-Dec-2026.",
    );

    // ==== 10 Dec 2026 ====
    setClock("2026-12-10T09:00");
    await openFile("OGSERC/RL/001");
    await expect(page.locator("main header:visible")).toContainText(
      "Currently with: Registry",
    );
    await expect(detail(page, "Inward items")).toHaveText("2");
    await expect(detail(page, "Outward items")).toHaveText("1");
    await expect(detail(page, "Last correspondence")).toHaveText("01-Dec-2026");
    const m1 = page.locator("tr:visible", {
      hasText: "Reg. Officer (Registration & Licensing)",
    });
    await expect(m1).toContainText("25-Nov-2026"); // return due and returned
    await expect(m1).toContainText("Returned");
    await expect(m1.locator("td").nth(5)).toHaveText("3"); // working days out

    await openFile("OGSERC/GOV/001");
    await expect(page.locator("main header:visible")).toContainText(
      "Currently with: PA to Chairman (Office of the Chairman) since 02-Dec-2026 (6 working days)",
    );
    await expect(flagList(page)).toContainText("Out beyond return date");
    const m2 = page.locator("tr:visible", {
      hasText: "PA to Chairman (Office of the Chairman)",
    });
    await expect(m2).toContainText("07-Dec-2026");
    await expect(m2).toContainText("Overdue");

    await page.goto("/files?out=1");
    await expect(page.locator("tbody:visible tr")).toHaveCount(1);
    await expect(page.locator("tbody:visible")).toContainText("OGSERC/GOV/001");

    // Dashboard on 10 Dec 2026 (SPEC §12.2, Phase 7 done-when).
    await page.goto("/dashboard");
    const stat = (group: string, label: string) =>
      page
        .locator("main section:visible", {
          has: page.getByRole("heading", { name: group, exact: true }),
        })
        .locator("a, div", { hasText: new RegExp(`^[\\d—]+%?${label}$`) })
        .first();
    const expectStat = async (group: string, label: string, value: string) =>
      expect(stat(group, label)).toHaveText(`${value}${label}`);
    await expectStat("Incoming", "Items logged", "3");
    await expectStat("Incoming", "Awaiting forwarding", "1");
    await expectStat("Incoming", "Closed", "2");
    await expectStat("Incoming", "Closed on time", "100%");
    await expectStat("Incoming", "Received after hours / non-working day", "1");
    await expectStat("Outgoing", "Items logged", "2");
    await expectStat("Outgoing", "Responses received", "1");
    await expectStat("Outgoing", "Replies to inward items", "2");
    await expectStat("Files", "Files out with officers", "1");
    await expectStat("Files", "Files overdue", "1");
    await page.getByRole("button", { name: "Show as table" }).first().click();
    await expect(page.locator("main:visible")).toContainText("Dec 26");

    // Issue again while still out: asked first; Cancel issues nothing.
    await openFile("OGSERC/GOV/001");
    await issue("Legal Adviser", "Legal");
    const ask = page.getByRole("alertdialog", { name: "Confirm issue" });
    await expect(ask).toContainText(
      "OGSERC/GOV/001 is still out with PA to Chairman (Office of the Chairman). Issue it anyway?",
    );
    await ask.getByRole("link", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.locator("tr:visible", { hasText: "Legal Adviser" }),
    ).toHaveCount(0);

    await issue("Legal Adviser", "Legal");
    await page.getByRole("button", { name: "Issue anyway" }).click();
    await expect(status(page)).toContainText(
      "OGSERC/GOV/001 issued to Legal Adviser. Return due 15-Dec-2026.",
    );
    await page.reload();
    await expect(
      page.locator("tr:visible", { hasText: "Legal Adviser (Legal)" }),
    ).toContainText("Earlier movement of this file not returned");
  } finally {
    setClock();
  }
});

// Runs last: it adds a fourth inward item, which would change the §12.2
// dashboard figures checked above.
test("Save + PDF slip downloads the new item's slip", async ({ page }) => {
  await signInAs(page, "registry.officer1@example.invalid");
  await page.goto("/inward/new");
  await fill(page, { sender: "Walk-in visitor", subject: "Enquiry" });
  await choose(page, {
    modeId: "Hand delivery",
    typeId: "Other correspondence",
    senderCategoryId: "Consumer / member of public",
    actionRequiredId: "For information",
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save + PDF slip" }).click();
  await expect(status(page)).toContainText("Saved as OGSERC/ACK/2026/00004.");
  expect((await download).suggestedFilename()).toBe(
    "Slip OGSERC-ACK-2026-00004.pdf",
  );
});

// ---- Phase 7: jobs and audit log ------------------------------------------

test("admin runs the holiday check; the Head of Registry reads the audit log", async ({
  page,
}) => {
  await signInAs(page, "admin@example.invalid");
  await page.goto("/admin/jobs");
  await page
    .locator("section:visible", { hasText: "Holiday check" })
    .getByRole("button", { name: "Run now" })
    .click();
  await expect(status(page)).toContainText(
    "Boxing Day holiday (substitute) (2026-12-28)",
  );
  await page.getByRole("button", { name: "Sign out" }).click();

  await signInAs(page, "head.registry@example.invalid");
  await expect(page.locator("[role=note]:visible")).toContainText(
    "Public holidays to confirm",
  );
  await page.goto("/admin/audit?q=OGSERC/GOV/001");
  await expect(page.locator("main:visible")).toContainText("issue");
  await expect(page.locator("main:visible")).toContainText("Legal Adviser");
});

// ---- Phase 8: reference data ----------------------------------------------

test("a holiday added by the Head of Registry moves I2's deadline", async ({
  page,
}) => {
  await signInAs(page, "head.registry@example.invalid");
  const i2Due = async () => {
    await page.goto("/inward?q=OGSERC/ACK/2026/00002");
    await page.getByRole("link", { name: "OGSERC/ACK/2026/00002" }).click();
    await page.waitForURL(/\/inward\/[0-9a-f-]{36}$/);
    return detail(page, "Response due").innerText();
  };
  expect(await i2Due()).toBe("15-Dec-2026");

  await page.goto("/admin/holidays");
  const add = page.locator("form:visible", {
    has: page.getByRole("button", { name: "Add holiday" }),
  });
  await add.locator('[name="date"]').fill("2026-12-14");
  await add.getByRole("button", { name: "Add holiday" }).click();
  // The error keeps what was typed.
  await expect(add.locator("[role=alert]")).toContainText(
    "Enter the holiday's name.",
  );
  await expect(add.locator('[name="date"]')).toHaveValue("2026-12-14");
  await add.locator('[name="name"]').fill("State public holiday");
  await add.getByRole("button", { name: "Add holiday" }).click();
  await expect(page.locator("[role=status]:visible").first()).toContainText(
    "State public holiday added. Deadlines have been recalculated.",
  );
  expect(await i2Due()).toBe("16-Dec-2026");

  await page.goto("/admin/holidays");
  const entry = page.locator("details:visible", {
    hasText: "State public holiday",
  });
  await entry.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await entry.getByRole("button", { name: "Remove this holiday" }).click();
  await expect(
    page.locator("details:visible", { hasText: "State public holiday" }),
  ).toHaveCount(0);
  expect(await i2Due()).toBe("15-Dec-2026");
});
