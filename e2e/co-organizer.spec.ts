import { test, expect } from "./fixtures";
import { adminClient, loginCouple, setUpCouple, uniqueId } from "./helpers";

// A12: the couple gives the groom's side its own login; that co-organizer
// signs in, sees every guest, and can send only to the groom's side.
test("a co-organizer signs in and sends for their own side", async ({ page, anonPage }) => {
  const couple = await setUpCouple(page);
  const { data: event } = await adminClient().from("events").select("id").eq("couple_names", couple.coupleNames).single();
  await adminClient()
    .from("event_guests")
    .insert([
      { event_id: event!.id, full_name: "Гостин Невеста", side: "bride" },
      { event_id: event!.id, full_name: "Гостин Младоженец", side: "groom" },
    ]);

  await page.goto("/couple/guests");
  const username = `groom-${uniqueId()}`.slice(0, 40);
  await page.getByLabel("Страна на ко-организаторот").selectOption("groom");
  await page.getByLabel("Корисничко име").fill(username);
  const password = await page.getByLabel("Лозинка").inputValue();
  await page.getByRole("button", { name: "Додади ко-организатор" }).click();
  await expect(page.getByRole("status")).toContainText(password);

  // The co-organizer, in their own browser.
  await loginCouple(anonPage, { coupleNames: couple.coupleNames, username, password });
  await anonPage.goto("/couple/guests");
  await expect(anonPage.getByText(/Најавени сте како ко-организатор за страната на младоженецот/)).toBeVisible();
  await expect(anonPage.getByText("Гостин Невеста", { exact: true })).toBeVisible();
  await expect(anonPage.getByRole("button", { name: "Прати покана на Гостин Младоженец" })).toBeVisible();
  await expect(anonPage.getByRole("button", { name: "Прати покана на Гостин Невеста" })).toHaveCount(0);
  await expect(anonPage.getByRole("heading", { name: "Ко-организатори" })).toHaveCount(0);
});
