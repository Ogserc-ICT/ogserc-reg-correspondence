// SPEC-v2 C6 through the UI against the dev transport (V12): Review holds
// the email until a registry officer sends it; Resend asks first; Send
// emails on save. Runs last (file order); turns the email Off again at the end.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DEV_PASSWORD, E2E_MAIL_DIR, setClock } from "./env";

const field = (page: Page, name: string) =>
  page.locator(`[name="${name}"]:visible`);
const status = (page: Page) => page.locator("[role=status]:visible");

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

async function setMode(page: Page, label: string) {
  await signInAs(page, "admin@example.invalid");
  await page.goto("/admin/settings");
  await field(page, "ackEmailMode").selectOption({ label });
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(status(page)).toContainText("Settings saved.");
}

/** A tariff application: unit Tariff and Rates, division address empr@. */
async function logTariffItem(page: Page, sender: string) {
  await page.goto("/inward/new");
  await page.locator("main form").first().waitFor();
  await field(page, "sender").fill(sender);
  await field(page, "subject").fill("Tariff review request");
  await field(page, "modeId").selectOption({ label: "Hand delivery" });
  await field(page, "typeId").selectOption({
    label: "Tariff application / review",
  });
  await field(page, "senderCategoryId").selectOption({
    label: "Registrant / licensee",
  });
  await page.getByRole("button", { name: "Save to register" }).click();
  await expect(status(page)).toContainText("Saved as");
}

const mails = () => {
  try {
    return readdirSync(E2E_MAIL_DIR).map((f) =>
      readFileSync(path.join(E2E_MAIL_DIR, f), "utf8"),
    );
  } catch {
    return [];
  }
};

test("V12: Review → Emails to review → Send; Resend asks first; Send mode", async ({
  page,
}) => {
  test.setTimeout(180_000);
  setClock();

  await setMode(page, "Review before sending");

  await signInAs(page, "registry.officer1@example.invalid");
  await logTariffItem(page, "Review Mini-Grid Ltd");
  await expect(status(page)).toContainText(
    "Acknowledgement email to Tariff and Rates unit is waiting under 'Emails to review' on the Registry Desk.",
  );
  expect(mails()).toEqual([]);

  // Registry Desk → Emails to review → Send.
  await page.goto("/");
  const note = page.getByRole("note", { name: "Emails to review" });
  await expect(note).toContainText("Emails to review: 1");
  await note.getByRole("link", { name: "Review emails" }).click();
  await page.waitForURL(/\/emails$/);
  const held = page.getByRole("list", { name: "Emails to review" });
  await expect(held).toContainText("from Review Mini-Grid Ltd");
  await held.getByRole("button", { name: "Send" }).click();
  await expect(status(page)).toContainText(
    "Acknowledgement emailed to Tariff and Rates unit (empr@ogserc.org.ng).",
  );
  const [eml] = mails();
  expect(eml).toContain("To: empr@ogserc.org.ng");
  expect(eml).toMatch(/filename="Slip OGSERC-ACK-2026-\d{5}\.pdf"/);

  // The item shows it; Resend asks first and, in Review mode, holds it again.
  await page.goto("/emails");
  await page
    .getByRole("region", { name: "Email log" })
    .getByRole("row", { name: /Sent/ })
    .getByRole("link")
    .first()
    .click();
  await page.waitForURL(/\/inward\/[0-9a-f-]{36}$/);
  await expect(
    page
      .locator("dt:visible", { hasText: /^Acknowledgement emailed$/ })
      .locator("xpath=following-sibling::dd"),
  ).toHaveText("10-Dec-2026 09:00 to empr@ogserc.org.ng");
  await page.getByRole("button", { name: "Resend ack email" }).click();
  const ask = page.getByRole("alertdialog", { name: "Confirm resend" });
  await expect(ask).toContainText(
    "was emailed on 10-Dec-2026 09:00 to empr@ogserc.org.ng. Send it again?",
  );
  await ask.getByRole("button", { name: "Send again" }).click();
  await expect(status(page)).toContainText(
    "is waiting under 'Emails to review'",
  );

  // Discard the held resend.
  await page.goto("/emails");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("list", { name: "Emails to review" })
    .getByRole("button", { name: "Discard" })
    .click();
  await expect(status(page)).toContainText("email discarded, not sent.");
  expect(mails()).toHaveLength(1);

  // Send mode: emailed straight away on save.
  await setMode(page, "Send");
  await signInAs(page, "registry.officer1@example.invalid");
  await logTariffItem(page, "Send Mini-Grid Ltd");
  await expect(status(page)).toContainText(
    "Acknowledgement emailed to Tariff and Rates unit (empr@ogserc.org.ng).",
  );
  expect(mails()).toHaveLength(2);

  await setMode(page, "Off");
});
