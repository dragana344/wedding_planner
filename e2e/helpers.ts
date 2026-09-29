import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

// Shared steps for the smoke tests. Every test creates its own uniquely named
// venue/event/guest data, so tests are independent and the suite can be re-run
// against the same local database without a reset.

export function uniqueId(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

/** Service-role client for the LOCAL Supabase (playwright.config.ts refuses anything else). */
export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A date well in the future (YYYY-MM-DD), spread out so parallel runs don't share a day. */
export function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 120 + Math.floor(Math.random() * 600));
  return d.toISOString().slice(0, 10);
}

export type VenueAccount = { venueName: string; email: string; password: string };

/** Flow 1: sign a new venue up at /signup; resolves once the venue dashboard has loaded. */
export async function signUpVenue(page: Page): Promise<VenueAccount> {
  const id = uniqueId();
  const account = {
    venueName: `E2E Локал ${id}`,
    email: `e2e-venue-${id}@example.com`,
    password: `E2e-pass-${id}`,
  };
  await page.goto("/signup");
  await page.getByLabel("Име на локалот").fill(account.venueName);
  await page.getByLabel("Е-пошта").fill(account.email);
  await page.getByLabel("Лозинка").fill(account.password);
  await page.getByRole("button", { name: "Регистрирај се" }).click();

  await page.waitForURL((url) => url.pathname === "/venue", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Преглед на неделата" })).toBeVisible();
  return account;
}

export type CoupleAccount = { coupleNames: string; username: string; password: string };

/** Flow 2: from the venue panel's event list, create an event with couple credentials. */
export async function createEventWithCouple(page: Page): Promise<CoupleAccount> {
  const id = uniqueId();
  const couple = {
    coupleNames: `Ана & Марко ${id}`,
    username: `e2e-couple-${id}`,
    password: `Couple-pw-${id}`,
  };
  expect(couple.password.length).toBeGreaterThanOrEqual(10);

  await page.goto("/venue/events");
  await page.getByRole("link", { name: "ДОДАДИ НАСТАН" }).click();
  await page.waitForURL("**/venue/events/new");

  await page.getByLabel("Имиња на славениците").fill(couple.coupleNames);
  await page.getByLabel("Датум").fill(futureDate());
  await page.getByLabel("Корисничко име").fill(couple.username);
  await page.getByLabel("Лозинка").fill(couple.password);
  await page.getByLabel("Email на парот").fill(`${couple.username}@example.mk`);
  await page.getByLabel("Телефон на парот").fill("070 123 456");
  await page.getByRole("button", { name: "Креирај настан" }).click();

  await page.waitForURL((url) => url.pathname === "/venue/events", { timeout: 30_000 });
  await page.getByRole("searchbox", { name: "Пребарај настан" }).fill(couple.coupleNames);
  await expect(page.getByText(couple.coupleNames).first()).toBeVisible();
  return couple;
}

/** Flow 3 (first half): sign the couple in at /couple/login. */
export async function loginCouple(page: Page, couple: CoupleAccount): Promise<void> {
  await page.goto("/couple/login");
  await page.getByLabel("Корисничко име").fill(couple.username);
  await page.getByLabel("Лозинка").fill(couple.password);
  await page.getByRole("button", { name: "Најави се" }).click();
  await page.waitForURL((url) => url.pathname === "/couple", { timeout: 30_000 });
}

/** A signed-in couple with a fresh venue and event behind it. */
export async function setUpCouple(page: Page): Promise<CoupleAccount> {
  await signUpVenue(page);
  const couple = await createEventWithCouple(page);
  // The couple signs in from its own browser, not the venue's; drop the
  // venue's cookies so the couple session is the only one in play.
  await page.context().clearCookies();
  await loginCouple(page, couple);
  return couple;
}
