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

  // The venue linked two menus to the event, so a yes must say who eats what.
  const admin = adminClient();
  const { data: event } = await admin.from("events").select("id, venue_id").eq("couple_names", couple.coupleNames).single();
  const menuIds: string[] = [];
  for (const name of ["Месно мени", "Посно мени"]) {
    const { data: menu } = await admin.from("menu_templates").insert({ venue_id: event!.venue_id, name }).select("id").single();
    await admin.from("event_menu_templates").insert({ event_id: event!.id, menu_template_id: menu!.id });
    menuIds.push(menu!.id);
  }

  // An anonymous visitor (fresh browser context, no cookies).
  await anonPage.goto(`/invite/${slug}`);
  await expect(anonPage.getByText(couple.coupleNames).first()).toBeVisible();

  const guestName = `RSVP Гостин ${uniqueId()}`;
  await anonPage.getByLabel("Име и презиме").fill(guestName);
  await anonPage.getByRole("button", { name: "Ќе присуствувам" }).click();
  await anonPage.getByLabel("Број на лица (со вас)").fill("2");
  await anonPage.getByLabel("Месно мени", { exact: true }).fill("1");
  await anonPage.getByRole("button", { name: "Испрати одговор" }).click();
  await expect(anonPage.getByText("Изберете мени за сите 2 лица.")).toBeVisible();
  await anonPage.getByLabel("Посно мени", { exact: true }).fill("1");
  await anonPage.getByRole("button", { name: "Испрати одговор" }).click();
  await expect(anonPage.getByText("Го забележавме вашето доаѓање", { exact: false })).toBeVisible();

  // Recorded server-side...
  const { data: guest, error } = await admin
    .from("event_guests")
    .select("id, full_name, rsvp_status, party_size")
    .eq("full_name", guestName)
    .single();
  expect(error).toBeNull();
  expect(guest).toMatchObject({ rsvp_status: "confirmed", party_size: 2 });
  const { data: counts } = await admin.from("event_guest_menu_counts").select("menu_template_id, count").eq("guest_id", guest!.id);
  expect(Object.fromEntries(counts!.map((c) => [c.menu_template_id, c.count]))).toEqual({ [menuIds[0]]: 1, [menuIds[1]]: 1 });

  // ...and visible to the couple as a confirmed guest.
  await page.goto("/couple/guests");
  await expect(page.getByRole("button", { name: `Детали за ${guestName}` })).toBeVisible();
  await expect(page.getByRole("combobox", { name: `Статус за ${guestName}` })).toHaveValue("confirmed");
});
