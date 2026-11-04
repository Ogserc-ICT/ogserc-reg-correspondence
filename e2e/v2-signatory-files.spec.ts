// SPEC-v2 C7 and C8 through the UI: the outward signatory list (V11) and
// generated file references on the Internal File Desk (V9).
import { expect, test, type Page } from "@playwright/test";
import { DEV_PASSWORD, setClock } from "./env";

const field = (page: Page, name: string) =>
  page.locator(`[name="${name}"]:visible`);
const status = (page: Page) => page.locator("[role=status]:visible");
const detail = (page: Page, label: string) =>
  page
    .locator("dt:visible", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following-sibling::dd");

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

test.beforeEach(async ({ page }) => {
  setClock();
  await signInAs(page, "registry.officer1@example.invalid");
});

test("V9: a new file's reference is generated from its class", async ({
  page,
}) => {
  await page.goto("/files/new");
  await page.locator("main form").first().waitFor();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await field(page, "fileClassId").selectOption({ label: "Licensee file" });
  await expect(page.getByText("Leave blank for OGSERC/RL/002.")).toBeVisible();
  await field(page, "title").fill("Second licensee");
  await page.getByRole("button", { name: "Add to File Index" }).click();
  await expect(status(page)).toContainText(
    "OGSERC/RL/002 added to the File Index.",
  );
  await page.goto("/files");
  await expect(
    page.getByRole("heading", { name: "Internal File Desk", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "OGSERC/RL/002" })).toBeVisible();
});

test("V11: choosing Jide Onakoya fills in Chairman", async ({ page }) => {
  await page.goto("/outward/new");
  await page.locator("main form").first().waitFor();
  // Pre-selected: the Secretary to the Commission.
  await expect(field(page, "signatoryId").locator("option:checked")).toHaveText(
    "Oluwatoyin Sonoiki (Secretary to the Commission)",
  );
  await field(page, "subject").fill("Signatory check");
  await field(page, "addressee").fill("Sample Mini-Grid Ltd");
  await field(page, "typeId").selectOption({
    label: "Letter to NERC / Federal agency",
  });
  await field(page, "originatingUnitId").selectOption({
    label: "Licensing unit",
  });
  await field(page, "recipientCategoryId").selectOption({
    label: "Registrant / licensee",
  });
  await field(page, "dispatchModeId").selectOption({ label: "Email" });
  await field(page, "signatoryId").selectOption({
    label: "Jide Onakoya (Chairman)",
  });
  await page.getByRole("button", { name: "Save & get number" }).click();
  await expect(status(page)).toContainText("Quote it on the document.");
  await status(page).getByRole("link", { name: "Open the record" }).click();
  await page.waitForURL(/\/outward\/[0-9a-f-]{36}$/);
  await expect(detail(page, "Signed by")).toHaveText("Jide Onakoya — Chairman");
  await expect(detail(page, "Division")).toHaveText(
    "Legal, Licensing and Consumer Affairs",
  );
});
