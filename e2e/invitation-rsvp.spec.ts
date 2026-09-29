import { test, expect } from "./fixtures";
import { adminClient, setUpCouple, uniqueId } from "./helpers";

// Flow 4: the couple publishes the invitation link; a guest with no account
// opens it and answers the RSVP, and the answer reaches the couple's list.
test("public invitation loads and records an RSVP", async ({ page, anonPage }) => {
  const couple = await setUpCouple(page);

  await page.goto("/couple/invitation");
  await page.getByRole("button", { name: "Генерирај линк" }).click();
  const link = page.getByText(/\/invite\/[^/\s]+$/);
  await expect(link).toBeVisible();
  const inviteUrl = (await link.textContent())!.trim();
  const slug = new URL(inviteUrl).pathname.split("/").pop()!;
  expect(slug).toBeTruthy();

  // An anonymous visitor (fresh browser context, no cookies).
  await anonPage.goto(`/invite/${slug}`);
  await expect(anonPage.getByText(couple.coupleNames).first()).toBeVisible();

  const guestName = `RSVP Гостин ${uniqueId()}`;
  await anonPage.getByLabel("Име и презиме").fill(guestName);
  await anonPage.getByRole("button", { name: "Ќе присуствувам" }).click();
  await anonPage.getByLabel("Број на лица (со вас)").fill("2");
  await anonPage.getByLabel("Посно").check();
  await anonPage.getByRole("button", { name: "Испрати одговор" }).click();
  await expect(anonPage.getByText("Го забележавме вашето доаѓање", { exact: false })).toBeVisible();

  // Recorded server-side...
  const { data: guest, error } = await adminClient()
    .from("event_guests")
    .select("full_name, rsvp_status, party_size, menu_choice")
    .eq("full_name", guestName)
    .single();
  expect(error).toBeNull();
  expect(guest).toMatchObject({ rsvp_status: "confirmed", party_size: 2, menu_choice: "posno" });

  // ...and visible to the couple as a confirmed guest.
  await page.goto("/couple/guests");
  await expect(page.getByRole("button", { name: `Детали за ${guestName}` })).toBeVisible();
  await expect(page.getByRole("combobox", { name: `Статус за ${guestName}` })).toHaveValue("confirmed");
});
