import { test, expect } from "./fixtures";
import { setUpCouple, uniqueId } from "./helpers";

// Flow 3: the couple signs in and adds a guest, who then appears in the list.
test("couple logs in and adds a guest", async ({ page }) => {
  await setUpCouple(page);

  await page.goto("/couple/guests");
  const guestName = `Гостин ${uniqueId()}`;
  await page.getByLabel("Име и презиме").fill(guestName);
  await page.getByLabel("Телефон (по желба)").fill("070123456");
  await page.getByRole("button", { name: "Додади гостин" }).click();

  await expect(page.getByText(guestName, { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: `Статус за ${guestName}` })).toBeVisible();

  // Persisted, not just optimistic UI state.
  await page.reload();
  await expect(page.getByText(guestName, { exact: true })).toBeVisible();
});
