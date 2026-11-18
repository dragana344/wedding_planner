import { test, expect } from "./fixtures";
import { adminClient, createVenueAccount, signInVenue } from "./helpers";
import { LEGAL_VERSION } from "../lib/legal/facts";

// A venue the admin opened with "Нов локал": the first sign-in asks for the
// owner's own password, then the Terms (owner password + checkbox), then the
// dashboard opens with the onboarding tour.
test("first login: own password, then the Terms, then the tour", async ({ page }) => {
  const account = await createVenueAccount({ termsAccepted: false, mustChangePassword: true });
  await signInVenue(page, account);

  await expect(page.getByRole("heading", { name: "Поставете нова лозинка" })).toBeVisible({ timeout: 30_000 });
  const newPassword = `${account.password}-own`;
  await page.getByLabel("Нова лозинка").fill(newPassword);
  await page.getByLabel("Повторете ја лозинката").fill(newPassword);
  await page.getByRole("button", { name: "Зачувај лозинка" }).click();

  await expect(page.getByRole("heading", { name: "Услови за користење" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Прифаќам" })).toBeDisabled();
  await page.getByLabel("Лозинка на сопственикот").fill(account.ownerPassword);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Прифаќам" }).click();

  await expect(page.getByText("Тука креирате нов настан за клиент.")).toBeVisible({ timeout: 30_000 });
  const { data } = await adminClient().from("venues").select("terms_version, terms_accepted_at").eq("name", account.venueName).single();
  expect(data!.terms_version).toBe(LEGAL_VERSION);
  expect(data!.terms_accepted_at).not.toBeNull();
});
