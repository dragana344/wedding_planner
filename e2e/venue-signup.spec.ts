import { test, expect } from "./fixtures";
import { signUpVenue } from "./helpers";

// Flow 1: a new venue signs up and lands on its dashboard.
test("venue signup lands on the venue dashboard", async ({ page }) => {
  const account = await signUpVenue(page);

  await expect(page).toHaveURL(/\/venue$/);
  await expect(page.getByRole("heading", { name: "Претстојни настани" })).toBeVisible();

  // The session survives a reload (cookies, not just in-memory state).
  await page.reload();
  await expect(page).toHaveURL(/\/venue$/);
  await expect(page.getByRole("heading", { name: "Преглед на неделата" })).toBeVisible();
  expect(account.email).toContain("@");
});
