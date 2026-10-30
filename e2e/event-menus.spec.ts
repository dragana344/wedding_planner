import { test, expect } from "./fixtures";
import { adminClient, createEventWithCouple, createEventWithMenus, elevateAsOwner, loginCouple, signUpVenue, uniqueId } from "./helpers";

// Two packages on an event → a guest answers with 1 + 1 → the couple declines
// a second guest and sends the numbers → the venue sees them and presses Видено.
test("two menus → guest RSVP → couple sends numbers → venue sees them and presses Видено", async ({
  page,
  anonPage,
  browser,
  baseURL,
}) => {
  const admin = adminClient();
  const id = uniqueId();
  const menuA = `Месо ${id}`;
  const menuB = `Посно ${id}`;

  // The venue (this `page`) with two packages.
  const account = await signUpVenue(page);
  const { data: venue } = await admin.from("venues").select("id").eq("name", account.venueName).single();
  for (const name of [menuA, menuB]) {
    const { data: tpl, error } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name }).select("id").single();
    expect(error).toBeNull();
    const { data: dish, error: dishError } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: `Јадење ${name}`, allergen_tags: [], is_vegetarian: false, is_vegan: false, price: 10 })
      .select("id")
      .single();
    expect(dishError).toBeNull();
    const { error: linkError } = await admin.from("menu_template_items").insert({ menu_template_id: tpl!.id, menu_item_id: dish!.id });
    expect(linkError).toBeNull();
  }

  // The event is created through the wizard, selecting both packages.
  await page.goto("/venue/events");
  const couple = await createEventWithMenus(page, account, [menuA, menuB]);
  const { data: event } = await admin.from("events").select("id").eq("couple_names", couple.coupleNames).single();
  const { count } = await admin.from("event_menu_templates").select("*", { count: "exact", head: true }).eq("event_id", event!.id);
  expect(count).toBe(2);

  // Two guests.
  const guest1 = `Гостин Еден ${id}`;
  const guest2 = `Гостин Два ${id}`;
  const { data: g1 } = await admin
    .from("event_guests")
    .insert({ event_id: event!.id, full_name: guest1, party_size: 2 })
    .select("invite_token")
    .single();
  await admin.from("event_guests").insert({ event_id: event!.id, full_name: guest2, party_size: 1 });

  // The couple (own context) publishes the link and sets guest 2 to declined.
  await loginCouple(anonPage, couple);
  await anonPage.goto("/couple/invitation");
  await anonPage.getByRole("button", { name: "Генерирај линк" }).click();
  const inviteUrl = (await anonPage.getByText(/\/invite\/[^/\s]+$/).textContent())!.trim();
  const slug = new URL(inviteUrl).pathname.split("/").pop()!;

  // Guest 1 answers through their personal link: 1 + 1.
  const guestCtx = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-real-ip": `10.${Math.floor(Math.random() * 255)}.1.${1 + Math.floor(Math.random() * 253)}` },
  });
  try {
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(`/invite/${slug}?g=${g1!.invite_token}`);
    await expect(guestPage.getByRole("heading", { name: guest1 })).toBeVisible();
    await guestPage.getByRole("button", { name: "Ќе присуствувам" }).click();
    await guestPage.getByLabel(menuA, { exact: true }).fill("1");
    await guestPage.getByLabel(menuB, { exact: true }).fill("1");
    await guestPage.getByRole("button", { name: "Испрати одговор" }).click();
    await expect(guestPage.getByText("Вашиот одговор: Ќе присуствувате", { exact: false })).toBeVisible();
  } finally {
    await guestCtx.close();
  }

  // The couple declines guest 2 and sends the numbers.
  await anonPage.goto("/couple/guests");
  await anonPage.getByRole("combobox", { name: `Статус за ${guest2}` }).selectOption("declined");
  await expect(anonPage.getByRole("combobox", { name: `Статус за ${guest2}` })).toHaveValue("declined");
  await anonPage.getByRole("button", { name: "Испрати ги бројките до салата" }).click();
  const confirm = anonPage.getByRole("group", { name: "Потврда за испраќање" });
  await expect(confirm.getByText("Вкупно: 2")).toBeVisible();
  await confirm.getByRole("button", { name: "Потврди и испрати" }).click();
  await expect(anonPage.getByText(/Испратено на/)).toBeVisible();

  // The venue (elevation lives in React state, so elevate on the list and open the event client-side).
  await page.goto("/venue/events");
  await elevateAsOwner(page, account);
  await page.getByRole("searchbox", { name: "Пребарај настан" }).fill(couple.coupleNames);
  const row = page.getByRole("button", { name: `Отвори ${couple.coupleNames}` });
  await expect(row.getByText("Нови бројки", { exact: true })).toBeVisible();
  await row.click();
  const section = page.locator("fieldset", { has: page.getByText("Бројки за мени", { exact: true }) });
  await expect(section.getByText(`${menuA} — 1`)).toBeVisible();
  await expect(section.getByText(`${menuB} — 1`)).toBeVisible();
  await expect(section.getByText("Вкупно — 2")).toBeVisible();
  await expect(section.getByText("Нови бројки од парот")).toBeVisible();
  await section.getByRole("button", { name: "Видено" }).click();
  await expect(section.getByText("Нови бројки од парот")).toHaveCount(0);
  await expect(section.getByText(`${menuA} — 1`)).toBeVisible();

  // Back on the list the marker is gone too.
  await page.keyboard.press("Escape");
  await expect(row.getByText("Нови бројки", { exact: true })).toHaveCount(0);
});

// The manager builds the event's own menu right in the new-event form; it is
// created with the event, listed under Мени/Пакети's custom menus, and shown
// to the couple.
test("custom menu built while creating the event", async ({ page, anonPage }) => {
  const admin = adminClient();
  const id = uniqueId();
  const menuName = `Мени на парот ${id}`;
  const dishName = `Сарма ${id}`;

  const account = await signUpVenue(page);
  const { data: venue } = await admin.from("venues").select("id").eq("name", account.venueName).single();
  // Whatever the default plan says, this venue gets the custom menu.
  const { error: overrideError } = await admin
    .from("venue_feature_overrides")
    .upsert({ venue_id: venue!.id, feature_key: "custom_menu", enabled: true });
  expect(overrideError).toBeNull();
  const { data: dish, error: dishError } = await admin
    .from("menu_items")
    .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: dishName, allergen_tags: [], is_vegetarian: false, is_vegan: false, price: 10 })
    .select("id")
    .single();
  expect(dishError).toBeNull();

  const couple = await createEventWithCouple(page, account, [], { name: menuName, dishIds: [dish!.id] });
  const { data: event } = await admin.from("events").select("id").eq("couple_names", couple.coupleNames).single();
  const { data: menu } = await admin.from("menu_templates").select("id, name").eq("event_id", event!.id).single();
  expect(menu!.name).toBe(menuName);
  const { data: links } = await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", event!.id);
  expect(links).toEqual([{ menu_template_id: menu!.id }]);

  // Мени/Пакети lists it under the event custom menus, not as a standard package.
  await page.goto("/venue/menus");
  await page.getByRole("button", { name: "Пакети", exact: true }).click();
  await expect(page.getByText(menuName).first()).toBeVisible();

  // The couple sees it on their view-only Мени page.
  await loginCouple(anonPage, couple);
  await anonPage.goto("/couple/menu");
  await expect(anonPage.getByText(menuName)).toBeVisible();
  await expect(anonPage.getByText(dishName)).toBeVisible();
});
