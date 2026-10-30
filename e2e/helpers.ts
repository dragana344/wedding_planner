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

export type VenueAccount = {
  venueName: string;
  email: string;
  password: string;
  /** The owner's manager-login name/password (venue-manager-staff-login spec) — needed by elevateAsOwner. */
  ownerName: string;
  ownerPassword: string;
};

/** Flow 1: sign a new venue up at /signup; resolves once the venue dashboard has loaded. */
export async function signUpVenue(page: Page): Promise<VenueAccount> {
  const id = uniqueId();
  const account = {
    venueName: `E2E Локал ${id}`,
    email: `e2e-venue-${id}@example.com`,
    password: `E2e-pass-${id}`,
    ownerName: `Сопственик ${id}`,
    ownerPassword: `Owner-pass-${id}`,
  };
  await page.goto("/signup");
  await page.getByLabel("Име на локалот").fill(account.venueName);
  await page.getByLabel("Име (за менаџерска најава)").fill(account.ownerName);
  await page.getByLabel("Менаџерска лозинка").fill(account.ownerPassword);
  await page.getByLabel("Е-пошта").fill(account.email);
  // Exact match: "Лозинка" is also a substring of "Менаџерска лозинка" above,
  // which would otherwise make this locator ambiguous (final review finding).
  await page.getByLabel("Лозинка", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Регистрирај се" }).click();

  await page.waitForURL((url) => url.pathname === "/venue", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Преглед на неделата" })).toBeVisible();
  return account;
}

/**
 * Elevates the currently loaded venue page's session to manager (as the
 * owner), via the account menu — the UI path, same as a real manager would
 * use. Must be called on a page already loaded in the venue panel (not
 * followed by page.goto, which is a real browser navigation that drops the
 * elevation held only in React state — use a client-side <Link> click after
 * this instead, same as the rest of the panel's own navigation).
 */
export async function elevateAsOwner(page: Page, account: VenueAccount): Promise<void> {
  await page.getByRole("button", { name: account.venueName }).click();
  await page.getByRole("menuitem", { name: "Логирај се како менаџер" }).click();
  await page.getByLabel("Име").fill(account.ownerName);
  await page.getByLabel("Лозинка", { exact: true }).fill(account.ownerPassword);
  await page.getByRole("button", { name: "Најави се" }).click();
  await expect(page.getByText(`Менаџер: ${account.ownerName}`)).toBeVisible();
  // The dropdown stays open after a successful elevation (by design — it
  // swaps the login form for the menu list rather than closing). At phone
  // width that open menu overlaps page content underneath it, intercepting
  // clicks meant for e.g. "ДОДАДИ НАСТАН" (final review follow-up finding).
  // Escape is the menu's own documented close path.
  await page.keyboard.press("Escape");
}

export type CoupleAccount = { coupleNames: string; username: string; password: string };

/** Flow 2: from the venue panel's event list, create an event with couple credentials. */
export async function createEventWithCouple(
  page: Page,
  account: VenueAccount,
  menuNames: string[] = [],
  /** Also builds the event's own menu in the form's popup, from these dish ids. */
  customMenu?: { name: string; dishIds: string[] },
): Promise<CoupleAccount> {
  const id = uniqueId();
  const couple = {
    coupleNames: `Ана & Марко ${id}`,
    username: `e2e-couple-${id}`,
    password: `Couple-pw-${id}`,
  };
  expect(couple.password.length).toBeGreaterThanOrEqual(10);

  await page.goto("/venue/events");
  // Creating an event now requires manager elevation (venue-manager-staff-login
  // spec) — done here, before the client-side Link click below, since a
  // page.goto afterward would drop it (final review finding: this test used
  // to create an event without ever elevating).
  await elevateAsOwner(page, account);
  await page.getByRole("link", { name: "ДОДАДИ НАСТАН" }).click();
  await page.waitForURL("**/venue/events/new");

  // The new-event wizard (2026-10-20 redesign): type first (auto-advances),
  // then name, date, and straight through the optional steps to credentials
  // and contact.
  await page.getByRole("button", { name: "Свадба" }).click();
  await page.getByLabel("Имиња на младенците").fill(couple.coupleNames);
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByLabel("Датум").fill(futureDate());
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByRole("button", { name: "Понатаму" }).click(); // guests: default is fine
  // rooms/menu: optional; the packages to offer (menus must already exist for the venue).
  for (const name of menuNames) await page.getByRole("button", { name, exact: true }).click();
  if (customMenu) {
    await page.getByRole("button", { name: /^Сопствено мени/ }).click();
    for (const dishId of customMenu.dishIds) await page.getByTestId(`pkg-toggle-${dishId}`).click();
    await page.getByRole("textbox", { name: "Име на пакетот" }).fill(customMenu.name);
    await page.getByRole("button", { name: "Зачувај мени" }).click();
    await expect(page.getByText("Сопствено мени · " + customMenu.dishIds.length + " јадења")).toBeVisible();
  }
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByRole("button", { name: "Прескокни" }).click(); // price: optional
  await page.getByLabel("Корисничко име").fill(couple.username);
  await page.getByLabel("Лозинка").fill(couple.password);
  await page.getByRole("button", { name: "Понатаму" }).click();
  await page.getByLabel("Email на парот").fill(`${couple.username}@example.mk`);
  await page.getByLabel("Телефон на парот").fill("070 123 456");
  await page.getByRole("button", { name: "Креирај настан" }).click();

  // Submitting shows a one-time credentials handover screen (the couple's
  // password is only ever visible here) before navigating away.
  await page.getByRole("button", { name: "Кон настаните" }).click();
  await page.waitForURL((url) => url.pathname === "/venue/events", { timeout: 30_000 });
  await page.getByRole("searchbox", { name: "Пребарај настан" }).fill(couple.coupleNames);
  await expect(page.getByText(couple.coupleNames).first()).toBeVisible();
  return couple;
}

/** Like createEventWithCouple, but the wizard also selects the given packages (menu templates of this venue) for the event. */
export async function createEventWithMenus(
  page: Page,
  account: VenueAccount,
  menuNames: string[],
): Promise<CoupleAccount> {
  return createEventWithCouple(page, account, menuNames);
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
  const account = await signUpVenue(page);
  const couple = await createEventWithCouple(page, account);
  // The couple signs in from its own browser, not the venue's; drop the
  // venue's cookies so the couple session is the only one in play.
  await page.context().clearCookies();
  await loginCouple(page, couple);
  return couple;
}

// Flow 4 (admin dashboard, spec §3.1): the admin panel is served from its own
// host — admin.<domain> in production, admin.localhost:<port> locally
// (*.localhost resolves to loopback in Chromium/macOS, no /etc/hosts entry
// needed). E2E_PORT is shared with playwright.config.ts (the machine runs
// several sessions, each on its own port).
const ADMIN_PORT = Number(process.env.E2E_PORT ?? 3200);
export const ADMIN_BASE = `http://admin.localhost:${ADMIN_PORT}`;

export type AdminAccount = { email: string; password: string; userId: string };

/**
 * Creates a platform admin with the service role, then signs in through the
 * real admin UI at ADMIN_BASE/login. Resolves once the panel's overview page
 * has loaded on the given `page`.
 *
 * The caller must delete the returned `userId` (via adminClient()) once
 * done — this helper only creates, it never cleans up.
 */
export async function createAdminAndSignIn(page: Page): Promise<AdminAccount> {
  const id = uniqueId();
  const email = `e2e-admin-${id}@example.com`;
  const password = `Admin-pass-${id}`;

  const db = adminClient();
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "platform_admin" },
  });
  if (createError || !created.user) throw createError ?? new Error("Failed to create the E2E admin user.");
  const userId = created.user.id;

  // From here on, delete the just-created user on any failure — otherwise a
  // mid-helper throw would leak an orphaned platform-admin account that no
  // caller's `finally` can clean up.
  try {
    await page.goto(`${ADMIN_BASE}/login`);
    await page.getByLabel("Е-пошта").fill(email);
    await page.getByLabel("Лозинка").fill(password);
    await page.getByRole("button", { name: "Најави се" }).click();
    await page.waitForURL((url) => url.pathname === "/admin", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Преглед" })).toBeVisible();

    return { email, password, userId };
  } catch (err) {
    await db.auth.admin.deleteUser(userId).catch(() => undefined);
    throw err;
  }
}
