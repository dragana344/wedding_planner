import { test, expect } from "./fixtures";
import { adminClient, setUpCouple, uniqueId } from "./helpers";

// Session 2 acceptance: a guest opens their personal link, answers with a
// menu choice and a note without typing a name, and the couple sees it all
// in the guest's details.
test("personal link → RSVP with menu → the couple sees it in the details", async ({ page, anonPage }) => {
  const couple = await setUpCouple(page);
  const admin = adminClient();
  const { data: event } = await admin.from("events").select("id").eq("couple_names", couple.coupleNames).single();
  const guestName = `Лична Покана ${uniqueId()}`;
  const { data: guest } = await admin
    .from("event_guests")
    .insert({ event_id: event!.id, full_name: guestName, party_size: 2 })
    .select("invite_token")
    .single();

  await page.goto("/couple/invitation");
  await page.getByRole("button", { name: "Генерирај линк" }).click();
  const inviteUrl = (await page.getByText(/\/invite\/[^/\s]+$/).textContent())!.trim();
  const slug = new URL(inviteUrl).pathname.split("/").pop()!;

  await anonPage.goto(`/invite/${slug}?g=${guest!.invite_token}`);
  await expect(anonPage.getByRole("heading", { name: guestName })).toBeVisible();
  await expect(anonPage.getByRole("navigation", { name: "Делови од поканата" })).toBeVisible();
  await expect(anonPage.getByText("Распоредот на маси уште не е готов", { exact: false })).toBeVisible();
  await expect(anonPage.getByLabel("Име и презиме")).toHaveCount(0);

  await anonPage.getByRole("button", { name: "Ќе присуствувам" }).click();
  await anonPage.getByLabel("од кои деца").fill("1");
  await anonPage.getByLabel("Посно").check();
  await anonPage.getByLabel("Порака до младенците (по желба)").fill("Доаѓаме со радост!");
  await anonPage.getByRole("button", { name: "Испрати одговор" }).click();
  await expect(anonPage.getByText("Вашиот одговор: Ќе присуствувате", { exact: false })).toBeVisible();

  await page.goto("/couple/guests");
  await page.getByRole("button", { name: `Детали за ${guestName}` }).click();
  const details = page.getByRole("dialog", { name: guestName });
  await expect(details.getByText("Потврден")).toBeVisible();
  await expect(details.getByText("2 (од кои 1 деца)")).toBeVisible();
  await expect(details.getByText("Посно")).toBeVisible();
  await expect(details.getByText("Доаѓаме со радост!")).toBeVisible();
});
