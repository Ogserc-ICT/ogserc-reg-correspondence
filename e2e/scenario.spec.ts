// Phase 4 acceptance: the SPEC §12.2 workbook scenario entered through the
// UI by a registry officer, with every computed value checked on screen.
// The app clock is 10 Dec 2026 09:00 Lagos (playwright.config APP_NOW).
import { expect, test, type Page } from "@playwright/test";
import { DEV_PASSWORD } from "./env";

// Next keeps the previous page in the DOM as a hidden Activity, so every
// locator is limited to visible elements.
const field = (page: Page, name: string) =>
  page.locator(`[name="${name}"]:visible`);

async function fill(page: Page, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values))
    await field(page, name).fill(value);
}

async function choose(page: Page, values: Record<string, string>) {
  for (const [name, label] of Object.entries(values))
    await field(page, name).selectOption({ label });
}

async function pick(page: Page, label: string, search: string, result: RegExp) {
  await page.getByRole("searchbox", { name: `Search ${label}` }).fill(search);
  await page.getByRole("option").getByRole("button", { name: result }).click();
}

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
  await expect(page.locator("ul.bg-status-flagged")).toHaveCount(0);

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
  await expect(page.locator("ul.bg-status-flagged")).toHaveCount(0);

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
});
