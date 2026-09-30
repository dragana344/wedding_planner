import { test, expect } from "./fixtures";
import { adminClient, createEventWithCouple, signUpVenue } from "./helpers";

// Flow 2: the venue creates an event together with the couple's login.
test("venue creates an event with couple credentials", async ({ page }) => {
  await signUpVenue(page);
  const couple = await createEventWithCouple(page);

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

// B6: a venue with more than one hall picks the hall before anything else.
test("new event in a two-hall venue starts with picking the hall", async ({ page }) => {
  const venue = await signUpVenue(page);
  const admin = adminClient();
  const { data: row, error } = await admin.from("venues").select("id").eq("name", venue.venueName).single();
  expect(error).toBeNull();
  await admin.from("rooms").insert([
    { venue_id: row!.id, name: "Голема сала" },
    { venue_id: row!.id, name: "Мала сала" },
  ]);

  await page.goto("/venue/events/new");
  await expect(page.getByRole("heading", { name: "Во која сала?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Продолжи" })).toBeDisabled();
  await page.getByRole("button", { name: /Мала сала/ }).click();
  await page.getByRole("button", { name: "Продолжи" }).click();
  await expect(page.getByLabel("Мала сала")).toBeChecked();
  await expect(page.getByLabel("Имиња на славениците")).toBeVisible();
});
