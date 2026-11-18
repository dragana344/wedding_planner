import { test, expect } from "./fixtures";
import { adminClient, createVenueAndSignIn, uniqueId } from "./helpers";

// Public signup is closed: /signup takes a demo request for the admin inbox.
test("a demo request from /signup lands in the admin inbox as kind 'demo'", async ({ page }) => {
  const email = `e2e-demo-${uniqueId()}@example.com`;
  await page.goto("/");
  await page.getByRole("link", { name: "Побарај демо" }).first().click();
  await page.waitForURL("**/signup");

  await page.getByLabel("Име и презиме").fill("Е2Е Барател");
  await page.getByLabel("Име на локалот").fill("Е2Е Ресторан");
  await page.getByLabel("Град").fill("Охрид");
  await page.getByLabel("Телефон").fill("070 123 456");
  await page.getByLabel("Е-пошта").fill(email);
  await page.getByRole("button", { name: "Побарај демо" }).click();
  await expect(page.getByText("Ви благодариме! Ќе ве контактираме наскоро.")).toBeVisible();

  const db = adminClient();
  const { data } = await db.from("contact_submissions").select("kind, message").eq("email", email).single();
  expect(data).toMatchObject({ kind: "demo", message: "Локал: Е2Е Ресторан\nГрад: Охрид\nТелефон: 070 123 456" });
  await db.from("contact_submissions").delete().eq("email", email);
});

// Flow 1: a venue the team opened signs in and lands on its dashboard.
test("a team-opened venue signs in and lands on the venue dashboard", async ({ page }) => {
  const account = await createVenueAndSignIn(page);

  await expect(page).toHaveURL(/\/venue$/);
  // The session survives a reload (cookies, not just in-memory state).
  await page.reload();
  await expect(page).toHaveURL(/\/venue$/);
  await expect(page.getByRole("heading", { level: 1, name: "КОНТРОЛНА ТАБЛА" })).toBeVisible();
  expect(account.email).toContain("@");
});
