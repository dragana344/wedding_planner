import { test, expect } from "./fixtures";
import { adminClient, elevateAsOwner, loginCouple, pickFutureCalendarDate, signUpVenue, uniqueId } from "./helpers";

// Project B: a mini-event claims part of a room's capacity instead of the
// whole room — created via the wizard's Mini choice, its tables assigned by
// staff on the "Маси" tab (never self-service), and shown to the couple as
// a plain read-only line, with no seating editor nav item at all.
test("a mini-event is created, staff assigns its tables, and the couple sees them read-only", async ({ page, anonPage }) => {
  const admin = adminClient();
  const account = await signUpVenue(page);
  const { data: venueRow } = await admin.from("venues").select("id").eq("name", account.venueName).single();
  const { data: roomRow } = await admin.from("rooms").insert({ venue_id: venueRow!.id, name: "Градина" }).select("id").single();
  const { data: tableType } = await admin
    .from("table_types")
    .insert({ room_id: roomRow!.id, name: "Round-4", shape: "round", seats: 4, width_cm: 100, length_cm: 100, quantity: 5 })
    .select("id")
    .single();
  await admin
    .from("room_layout_elements")
    .insert({ room_id: roomRow!.id, element_type: "table", table_type_id: tableType!.id, x_cm: 100, y_cm: 100, width_cm: 100, length_cm: 100 });

  const id = uniqueId();
  const coupleNames = `Рожден ден на Ива ${id}`;
  const username = `e2e-mini-${id}`;
  const password = `Mini-pw-${id}`;

  await page.goto("/venue/events");
  await elevateAsOwner(page, account);
  await page.getByRole("link", { name: "ДОДАДИ НАСТАН" }).click();
  await page.waitForURL("**/venue/events/new");

  await page.getByRole("button", { name: "Роденден" }).click();
  await page.getByRole("button", { name: "Мини настан" }).click();
  await page.getByLabel("Име на прославата").fill(coupleNames);
  await page.getByRole("button", { name: "Понатаму" }).click();
  await pickFutureCalendarDate(page);
  await page.getByLabel("Почеток").fill("18:00");
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByRole("button", { name: "Понатаму" }).click(); // guests: default is fine
  // The venue's only hall is pre-checked; nothing else to pick on this step.
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByRole("button", { name: "Прескокни" }).click(); // price
  await page.getByLabel("Корисничко име").fill(username);
  await page.getByLabel("Лозинка").fill(password);
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByLabel("Email на парот").fill(`${username}@example.mk`);
  await page.getByLabel("Телефон на парот").fill("070 123 456");
  await page.getByRole("button", { name: "Креирај настан" }).click();
  await expect(page.getByText("НАСТАНОТ Е КРЕИРАН")).toBeVisible();
  await page.getByRole("button", { name: "Кон настаните" }).click();

  // Staff assigns a specific table from the Маси tab — always staff-assisted.
  await page.getByRole("searchbox", { name: "Пребарај настан" }).fill(coupleNames);
  await page.getByRole("button", { name: `Отвори ${coupleNames}` }).click();
  await page.getByRole("button", { name: "Маси" }).click();
  await expect(page.getByRole("heading", { name: "Маси" })).toBeVisible();
  const firstTable = page.locator('[data-testid^="floor-plan-element-"]').first();
  await firstTable.waitFor();
  await firstTable.dispatchEvent("pointerdown");
  await page.dispatchEvent("body", "pointerup");
  await page.getByRole("button", { name: "Зачувај маси" }).click();
  await expect(page.getByText("Зачувано.")).toBeVisible();

  // The couple sees a plain read-only line, no seating nav item.
  await loginCouple(anonPage, { coupleNames, username, password });
  await anonPage.goto("/couple");
  await expect(anonPage.getByText(/Вашите маси во Градина: Маса \d+\./)).toBeVisible();
  await expect(anonPage.getByRole("link", { name: /Распоред/ })).toHaveCount(0);
});
