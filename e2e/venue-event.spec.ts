import { test, expect } from "./fixtures";
import { adminClient, createEventWithCouple, elevateAsOwner, futureDate, signUpVenue } from "./helpers";

// Flow 2: the venue creates an event together with the couple's login.
test("venue creates an event with couple credentials", async ({ page }) => {
  const account = await signUpVenue(page);
  const couple = await createEventWithCouple(page, account);

  // The event and its credentials exist server-side, under the new venue.
  const { data: event, error } = await adminClient()
    .from("events")
    .select("id, couple_names")
    .eq("couple_names", couple.coupleNames)
    .single();
  expect(error).toBeNull();
  expect(event?.couple_names).toBe(couple.coupleNames);

  // Wrong password is refused at the couple login (a broken login must fail CI too).
  await page.context().clearCookies();
  await page.goto("/couple/login");
  await page.getByLabel("Корисничко име").fill(couple.username);
  await page.getByLabel("Лозинка").fill(`${couple.password}-wrong`);
  await page.getByRole("button", { name: "Најави се" }).click();
  await expect(page.locator(".auth-error")).toBeVisible();
  await expect(page).toHaveURL(/\/couple\/login$/);
});

// The wizard opens straight to the type grid regardless of how many halls
// the venue has — a hall is picked later, on its own rooms/menu step, where
// a two-hall venue sees both as cards (2026-10-20 redesign).
test("new event in a two-hall venue offers both halls on the rooms step", async ({ page }) => {
  const venue = await signUpVenue(page);
  const admin = adminClient();
  const { data: row, error } = await admin.from("venues").select("id").eq("name", venue.venueName).single();
  expect(error).toBeNull();
  await admin.from("rooms").insert([
    { venue_id: row!.id, name: "Голема сала" },
    { venue_id: row!.id, name: "Мала сала" },
  ]);

  await page.goto("/venue/events/new");
  await elevateAsOwner(page, venue);
  await expect(page.getByRole("heading", { name: "Каков настан славиме?" })).toBeVisible();
  await page.getByRole("button", { name: "Свадба" }).click();

  await expect(page.getByLabel("Имиња на младенците")).toBeVisible();
  await page.getByLabel("Имиња на младенците").fill("Проверка на сали");
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByLabel("Датум").fill(futureDate());
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByRole("button", { name: "Понатаму" }).click(); // guests: default is fine

  await expect(page.getByRole("button", { name: "Голема сала" })).toBeVisible();
  await page.getByRole("button", { name: "Мала сала" }).click();
  await expect(page.getByRole("button", { name: "Мала сала" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Голема сала" })).toHaveAttribute("aria-pressed", "false");
});
