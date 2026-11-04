// SPEC-v2 C3, C4 through the UI: the front desk logs a hand delivery, the
// Registry registers it from the Front Desk, and a second intake is pulled
// into a form that already has data. Runs after scenario.spec.ts (file
// order); it reads the ACK numbers it is given rather than assuming them.
import { expect, test, type Page } from "@playwright/test";
import { DEV_PASSWORD, setClock } from "./env";

const field = (page: Page, name: string) =>
  page.locator(`[name="${name}"]:visible`);
const status = (page: Page) => page.locator("[role=status]:visible");
const alert = (page: Page) =>
  page.locator("[role=alert]:visible:not(#__next-route-announcer__)");

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

async function receivedAt(page: Page, value: string) {
  await page.locator('input[type="datetime-local"]:visible').fill(value);
}

test("front desk intake → registered on New Inward (V6, E7)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  setClock();

  // ---- Front desk officer ---------------------------------------------------
  await signInAs(page, "front.desk@example.invalid");
  // Lands on the Front Desk; no registers (C12).
  await expect(page).toHaveURL(/\/front-desk$/);
  await expect(page.getByRole("link", { name: "Inward" })).toHaveCount(0);

  await receivedAt(page, "2026-12-04T16:30");
  await field(page, "sender").fill("Verde Solar Ltd");
  await field(page, "subject").fill("Application for mini-grid permit");
  await field(page, "deliveredBy").fill("Mr B. Courier");
  await page.getByRole("button", { name: "Save to front desk log" }).click();
  await expect(status(page)).toContainText(
    "Logged as OGSERC/FD/2026/00001. No acknowledgement has been issued.",
  );

  await receivedAt(page, "2026-12-09T10:00");
  await field(page, "sender").fill("Ogun Mini-Grid Co");
  await field(page, "subject").fill("Tariff review request");
  await page.getByRole("button", { name: "Save to front desk log" }).click();
  await expect(status(page)).toContainText("Logged as OGSERC/FD/2026/00002.");

  const waiting = page.getByRole("region", { name: "Awaiting registry" });
  await expect(
    waiting.getByRole("row", { name: /OGSERC\/FD\/2026\/00001/ }),
  ).toContainText("4"); // working days waiting on 10 Dec
  // The page streams, so the refusal shows as the forbidden page.
  await page.goto("/inward");
  await expect(
    page.getByRole("heading", { name: "You can't open this page" }),
  ).toBeVisible();

  // ---- Registry officer: Register from the Front Desk -----------------------
  await signInAs(page, "registry.officer1@example.invalid");
  await page.goto("/front-desk");
  await page
    .getByRole("region", { name: "Awaiting registry" })
    .getByRole("row", { name: /OGSERC\/FD\/2026\/00001/ })
    .getByRole("link", { name: "Register" })
    .click();
  await page.waitForURL(/\/inward\/new\?intake=/);
  await expect(
    page
      .locator("main form:visible")
      .getByText("OGSERC/FD/2026/00001", { exact: true }),
  ).toBeVisible();
  await expect(field(page, "sender")).toHaveValue("Verde Solar Ltd");
  await expect(field(page, "deliveredBy")).toHaveValue("Mr B. Courier");
  await expect(
    page.locator('input[type="datetime-local"]:visible'),
  ).toHaveValue("2026-12-04T16:30");
  // No routing fields on New Inward (C4).
  await expect(field(page, "actionRequiredId")).toHaveCount(0);
  await expect(field(page, "unitOverrideId")).toHaveCount(0);

  await field(page, "typeId").selectOption({ label: "Consumer complaint" });
  await field(page, "senderCategoryId").selectOption({
    label: "Registrant / licensee",
  });
  await page.getByRole("button", { name: "Save to register" }).click();
  // The ACK number follows whatever the register already holds.
  await expect(status(page)).toContainText(
    /Saved as OGSERC\/ACK\/2026\/\d{5}\./,
  );
  const ack = /OGSERC\/ACK\/2026\/\d{5}/.exec(
    (await status(page).textContent()) ?? "",
  )![0];
  await expect(status(page)).toContainText(
    "Routing, file reference and handling will be set by the Secretary / Head of Admin on the Routing Desk.",
  );

  // Pulling it again is refused.
  await page.goto("/front-desk/log?q=FD/2026/00001");
  await expect(
    page.getByRole("row", { name: /OGSERC\/FD\/2026\/00001/ }),
  ).toContainText("Registered");
  await expect(
    page.getByRole("row", { name: /OGSERC\/FD\/2026\/00001/ }),
  ).toContainText(ack);
  const registered = await page
    .getByRole("row", { name: /OGSERC\/FD\/2026\/00001/ })
    .getByRole("link", { name: ack })
    .getAttribute("href");
  expect(registered).toMatch(/^\/inward\//);

  // ---- Pull into a form with data; change the time → reason (E7) ------------
  await page.goto("/inward/new");
  await page.locator("main form").first().waitFor();
  await field(page, "sender").fill("Typed before pulling");
  const picker = page.getByLabel("Front desk intake");
  await picker.selectOption(
    (await picker
      .locator("option", { hasText: "OGSERC/FD/2026/00002" })
      .getAttribute("value")) ?? "",
  );
  page.once("dialog", async (d) => {
    expect(d.message()).toBe(
      "Replace what is typed on this form with the front desk details?",
    );
    await d.accept();
  });
  await page.getByRole("button", { name: "Pull details" }).click();
  await expect(field(page, "sender")).toHaveValue("Ogun Mini-Grid Co");

  await receivedAt(page, "2026-12-09T09:30");
  await field(page, "typeId").selectOption({ label: "Consumer complaint" });
  await field(page, "senderCategoryId").selectOption({
    label: "Registrant / licensee",
  });
  await page.getByRole("button", { name: "Save to register" }).click();
  await expect(alert(page)).toContainText(
    "the receipt time differs from OGSERC/FD/2026/00002, so give a reason.",
  );
  // The intake stays chosen after the error.
  await expect(
    page
      .locator("main form:visible")
      .getByText("OGSERC/FD/2026/00002", { exact: true }),
  ).toBeVisible();
  await field(page, "receiptChangeReason").fill("Logged late at the desk");
  await page.getByRole("button", { name: "Save to register" }).click();
  await expect(status(page)).toContainText(
    /Saved as OGSERC\/ACK\/2026\/\d{5}\./,
  );
  await expect(status(page)).not.toContainText(ack);
});
