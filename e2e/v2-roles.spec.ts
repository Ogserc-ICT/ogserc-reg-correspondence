// One check per role (SPEC §10, SPEC-v2 C12): where each dev login lands,
// which menu links it gets, and a page it is refused. Reads only, so the
// order of spec files doesn't matter.
import { expect, test, type Page } from "@playwright/test";
import { ROUTING_REFUSED } from "../src/domain/routing";
import { DEV_PASSWORD, setClock } from "./env";

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

const menu = (page: Page) =>
  page.getByRole("navigation", { name: "Main" }).filter({ visible: true });

type Case = {
  role: string;
  email: string;
  landsOn: string;
  sees: string[];
  doesNotSee: string[];
  /** A page the role is refused, and how the refusal reads. */
  refused: { path: string; text: string };
};

const FORBIDDEN = "You can't open this page";

const CASES: Case[] = [
  {
    role: "Registry officer",
    email: "registry.officer1@example.invalid",
    landsOn: "/",
    sees: ["Inward", "Outward", "Front Desk", "Emails", "Internal File Desk"],
    doesNotSee: ["Routing Desk", "Organisation", "Users"],
    refused: { path: "/routing", text: ROUTING_REFUSED },
  },
  {
    role: "Head of Registry",
    email: "head.registry@example.invalid",
    landsOn: "/",
    sees: ["Inward", "Emails", "Organisation", "Reference lists", "Audit log"],
    doesNotSee: ["Routing Desk", "Users", "Settings"],
    refused: { path: "/admin/users", text: FORBIDDEN },
  },
  {
    role: "Secretary (can route)",
    email: "secretary@example.invalid",
    landsOn: "/",
    sees: ["Inward", "Routing Desk", "Front Desk", "Dashboard"],
    doesNotSee: ["Emails", "Organisation"],
    refused: { path: "/emails", text: FORBIDDEN },
  },
  {
    role: "Chairman (Secretary role, cannot route)",
    email: "chairman@example.invalid",
    landsOn: "/",
    sees: ["Inward", "Dashboard"],
    doesNotSee: ["Routing Desk", "Emails"],
    refused: { path: "/routing", text: ROUTING_REFUSED },
  },
  {
    role: "Head of Administration (unit officer, can route)",
    email: "head.admin@example.invalid",
    landsOn: "/",
    sees: ["Inward", "Routing Desk"],
    doesNotSee: ["Internal File Desk", "Front Desk", "Emails"],
    refused: { path: "/files", text: FORBIDDEN },
  },
  {
    role: "Unit officer",
    email: "unit.registration@example.invalid",
    landsOn: "/",
    sees: ["Inward", "Outward"],
    doesNotSee: ["Routing Desk", "Front Desk", "Emails", "Internal File Desk"],
    refused: { path: "/front-desk", text: FORBIDDEN },
  },
  {
    role: "Front desk officer",
    email: "front.desk@example.invalid",
    landsOn: "/front-desk",
    sees: ["Front Desk"],
    doesNotSee: [
      "Registry Desk",
      "Inward",
      "Outward",
      "Routing Desk",
      "Emails",
    ],
    refused: { path: "/inward", text: FORBIDDEN },
  },
  {
    role: "Admin",
    email: "admin@example.invalid",
    landsOn: "/",
    sees: ["Users", "Organisation", "Settings", "Jobs"],
    doesNotSee: ["Inward", "Routing Desk", "Front Desk", "Emails"],
    refused: { path: "/inward", text: FORBIDDEN },
  },
];

for (const c of CASES)
  test(`${c.role}: lands, menu and a refused page`, async ({ page }) => {
    setClock();
    await signInAs(page, c.email);
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${c.landsOn}$`));
    for (const name of c.sees)
      await expect(
        menu(page).getByRole("link", { name, exact: true }),
        `${c.role} should see ${name}`,
      ).toBeVisible();
    for (const name of c.doesNotSee)
      await expect(
        menu(page).getByRole("link", { name, exact: true }),
        `${c.role} should not see ${name}`,
      ).toHaveCount(0);
    await page.goto(c.refused.path);
    await expect(
      page.getByText(c.refused.text, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  });
