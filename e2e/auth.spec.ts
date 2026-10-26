// Phase 3 in a real browser: sign-in, forced password change, role-gated
// pages, sign-out. Runs against the seeded e2e database.
import { expect, test, type Page } from "@playwright/test";
import { DEV_PASSWORD } from "./env";

async function submitSignIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until the app has left the sign-in page. */
async function signIn(page: Page, email: string, password = DEV_PASSWORD) {
  await submitSignIn(page, email, password);
  await page.waitForURL((url) => url.pathname !== "/login");
}

/** The form's error box (Next's route announcer is also role="alert"). */
const formAlert = (page: Page) => page.locator("form [role=alert]");

test("sends a visitor without a session to the sign-in page", async ({
  page,
}) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "OGSERC Registry" }),
  ).toBeVisible();
});

test("shows one message for a wrong password", async ({ page }) => {
  await submitSignIn(
    page,
    "registry.officer1@example.invalid",
    "not the password 1",
  );
  await expect(formAlert(page)).toContainText(
    "Email or password is incorrect.",
  );
  await expect(page.getByLabel("Email address")).toHaveValue(
    "registry.officer1@example.invalid",
  );
});

test("admin adds a user, who must change the temporary password", async ({
  page,
}) => {
  await signIn(page, "admin@example.invalid");
  await expect(page.getByText("Dev Admin · Admin")).toBeVisible();
  await page.getByRole("link", { name: "Users" }).click();
  await expect(
    page.getByRole("heading", { name: "Users", level: 1 }),
  ).toBeVisible();

  await page.getByLabel("Name").fill("Tolu Adeyemi");
  // getByRole skips hidden elements; Next keeps the previous page (the
  // sign-in form) in the DOM as a hidden Activity.
  await page
    .getByRole("textbox", { name: /^Email address/ })
    .fill("tolu.adeyemi@example.invalid");
  await page.getByLabel("Role").selectOption("REGISTRY_OFFICER");
  const temporary = await page.getByLabel("Temporary password").inputValue();
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Account created for tolu.adeyemi",
  );
  await expect(page.getByRole("link", { name: "Tolu Adeyemi" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, "tolu.adeyemi@example.invalid", temporary);
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByText("temporary password")).toBeVisible();
  // Can't skip it.
  await page.goto("/");
  await expect(page).toHaveURL(/\/account\/password$/);

  await page.getByLabel("Current password").fill(temporary);
  await page
    .getByRole("textbox", { name: /^New password At least/ })
    .fill("Lagos rain in July 42");
  await page.getByLabel("New password again").fill("Lagos rain in July 42");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Tolu Adeyemi · Registry officer")).toBeVisible();
});

test("a unit officer can't open admin pages", async ({ page }) => {
  await signIn(page, "unit.registration@example.invalid");
  await expect(
    page.getByText("Unit Officer (Registration & Licensing) · Unit officer"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  for (const path of ["/admin/users", "/admin/settings"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "You can't open this page" }),
    ).toBeVisible();
  }
});

test("the Head of Registry can't manage settings either", async ({ page }) => {
  await signIn(page, "head.registry@example.invalid");
  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "You can't open this page" }),
  ).toBeVisible();
});

test("admin changes a setting and sees every error at once", async ({
  page,
}) => {
  await signIn(page, "admin@example.invalid");
  await page.goto("/admin/settings");
  await page.getByLabel("Office closing time").fill("5pm");
  await page.getByLabel("Inward / acknowledgement prefix").fill("ack");
  await page.getByRole("button", { name: "Save settings" }).click();
  const alert = formAlert(page);
  await expect(alert).toContainText("Office closing time: use HH:mm");
  await expect(alert).toContainText("Inward prefix: capital letters");
  // What was typed is kept.
  await expect(page.getByLabel("Office closing time")).toHaveValue("5pm");

  await page.getByLabel("Office closing time").fill("17:00");
  await page.getByLabel("Inward / acknowledgement prefix").fill("OGSERC/ACK");
  await page.getByLabel("Secretary to the Commission").fill("A. B. Secretary");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
});
