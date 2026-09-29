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
  await anonPage.getByLabel("Your full name").fill(guestName);
  await anonPage.getByRole("button", { name: "Yes, I'll be there" }).click();
  await anonPage.getByLabel("Number of guests (including you)").fill("2");
  await anonPage.getByRole("button", { name: "Send RSVP" }).click();
  await expect(anonPage.getByText("we've noted you'll be attending")).toBeVisible();

  // Recorded server-side...
  const { data: guest, error } = await adminClient()
    .from("event_guests")
    .select("full_name, rsvp_status, party_size")
    .eq("full_name", guestName)
    .single();
  expect(error).toBeNull();
  expect(guest).toMatchObject({ rsvp_status: "confirmed", party_size: 2 });

  // ...and visible to the couple as a confirmed guest.
  await page.goto("/couple/guests");
  await expect(page.getByText(guestName, { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: `Статус за ${guestName}` })).toHaveValue("confirmed");
});
