// SPEC-v2 C5 through the UI (V1, V4, V5, C13.2), on the §12.2 data entered
// by scenario.spec.ts (file order: this runs after it and the front desk).
import { expect, test, type Page } from "@playwright/test";
import { DEV_PASSWORD, setClock } from "./env";

const status = (page: Page) => page.locator("[role=status]:visible");

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

async function openInward(page: Page, no: string) {
  await page.goto("/inward");
  await page
    .getByRole("row", { name: new RegExp(no) })
    .getByRole("link")
    .first()
    .click();
  await page.waitForURL(/\/inward\/[0-9a-f-]{36}$/);
}

async function loadOnRoutingDesk(page: Page, no: string) {
  await page.goto("/routing");
  await page.getByRole("searchbox", { name: "Search Inward item" }).fill(no);
  await page
    .getByRole("option")
    .getByRole("button", { name: new RegExp(no) })
    .click();
  await page.getByRole("button", { name: "Load" }).click();
  await page.waitForURL(/\/routing\?item=/);
}

test("V1: a registry officer is refused the Routing Desk", async ({ page }) => {
  setClock();
  await signInAs(page, "registry.officer1@example.invalid");
  await expect(page.getByRole("link", { name: "Routing Desk" })).toHaveCount(0);
  await page.goto("/routing");
  await expect(page.locator("[role=alert]:visible").first()).toHaveText(
    "Only the Secretary to the Commission and the Head of Administration can route items.",
  );
  await expect(page.getByRole("button", { name: "Load" })).toHaveCount(0);
});

test("V5: the Head of Administration can't route a closed item", async ({
  page,
}) => {
  setClock();
  await signInAs(page, "head.admin@example.invalid");
  await expect(
    page.getByRole("link", { name: "Routing Desk" }).first(),
  ).toBeVisible();
  await loadOnRoutingDesk(page, "ACK/2026/00001");
  await expect(page.getByText("is closed and cannot be routed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save routing" })).toHaveCount(
    0,
  );
});

test("V4: forwarding an unrouted item asks first, then flags it; routing keeps history", async ({
  page,
}) => {
  test.setTimeout(120_000);
  setClock();
  await signInAs(page, "registry.officer1@example.invalid");
  await openInward(page, "ACK/2026/00002");
  await expect(
    page
      .locator("dt:visible", { hasText: /^Routed by$/ })
      .locator("xpath=following-sibling::dd"),
  ).toHaveText("Not routed yet");
  await page.getByRole("button", { name: "Forwarded today" }).click();
  const ask = page.getByRole("alertdialog", { name: "Confirm forwarding" });
  await expect(ask).toContainText(
    "OGSERC/ACK/2026/00002 has not been routed by the Secretary / Head of Admin yet. Forward it anyway?",
  );
  await ask.getByRole("button", { name: "Forward anyway" }).click();
  await expect(status(page)).toContainText(
    "OGSERC/ACK/2026/00002 forwarded today.",
  );
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Flags" }).filter({ visible: true }),
  ).toContainText("Forwarded before routing");

  // The Head of Administration routes it twice: two history entries.
  await signInAs(page, "head.admin@example.invalid");
  await loadOnRoutingDesk(page, "ACK/2026/00002");
  await page
    .locator('[name="actionRequiredId"]:visible')
    .selectOption({ label: "Action required" });
  await page.getByRole("button", { name: "Save routing" }).click();
  await expect(status(page)).toContainText(
    "OGSERC/ACK/2026/00002 routed to Licensing unit by Head of Administration.",
  );
  await page
    .locator('[name="unitOverrideId"]:visible')
    .selectOption({ label: "ICT unit" });
  await page.getByRole("button", { name: "Save routing" }).click();
  await expect(status(page)).toContainText(
    "OGSERC/ACK/2026/00002 routed to ICT unit by Head of Administration.",
  );
  const history = page.getByRole("list", { name: "Routing history" });
  await expect(history.locator(":scope > li")).toHaveCount(2);
  await expect(history).toContainText(
    "Unit (override): The type's unit → ICT unit",
  );
});
