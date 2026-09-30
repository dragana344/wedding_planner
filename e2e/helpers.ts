import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { totp } from "./totp";

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

// Flow 4 (admin dashboard, spec §3.1): the admin panel is served from its own
// host — admin.<domain> in production, admin.localhost:<port> locally
// (*.localhost resolves to loopback in Chromium/macOS, no /etc/hosts entry
// needed). E2E_PORT is shared with playwright.config.ts (the machine runs
// several sessions, each on its own port).
const ADMIN_PORT = Number(process.env.E2E_PORT ?? 3200);
export const ADMIN_BASE = `http://admin.localhost:${ADMIN_PORT}`;

export type AdminAccount = { email: string; password: string; secret: string; userId: string };

/**
 * Creates a platform admin with the service role, enrols a verified TOTP
 * factor via the Supabase Auth API directly (same enrol/challengeAndVerify
 * calls as tests/supabase/admin_guard.test.ts — this only needs a verified
 * factor to exist, not to exercise the enrolment screen), then signs in
 * through the real admin UI at ADMIN_BASE/login: email/password, then the
 * 6-digit code computed from the enrolled secret (e2e/totp.ts). Resolves
 * once the panel's overview page has loaded on the given `page`.
 *
 * The caller must delete the returned `userId` (via adminClient()) once
 * done — this helper only creates, it never cleans up.
 */
const TOTP_STEP_MS = 30_000;
/** Codes generated this late in a window may expire before the server checks them. */
const TOTP_LATEST_SAFE_MS = 20_000;

/**
 * Waits until the current TOTP window is later than `usedWindow` and at most
 * TOTP_LATEST_SAFE_MS into its 30 s step, so the next code is both unused
 * and comfortably valid when submitted. At most ~40 s.
 */
async function waitForFreshTotpWindow(usedWindow: number): Promise<void> {
  for (;;) {
    const now = Date.now();
    const into = now % TOTP_STEP_MS;
    if (Math.floor(now / TOTP_STEP_MS) > usedWindow && into <= TOTP_LATEST_SAFE_MS) return;
    await new Promise((resolve) => setTimeout(resolve, TOTP_STEP_MS - into + 100));
  }
}

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

  // From here on, delete the just-created user on any failure (enrolment,
  // sign-in, the UI login itself) — otherwise a mid-helper throw would leak
  // an orphaned platform-admin account that no caller's `finally` can clean
  // up (it never gets to assign this function's return value).
  try {
    // Enrol + verify TOTP via the Auth API (no UI for this step: mandatory
    // enrolment at /admin/login/mfa is covered by unit/DB tests already; this
    // spec exercises the *code* step of a normal login).
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    const { data: enrolled, error: enrolError } = await anon.auth.mfa.enroll({ factorType: "totp" });
    if (enrolError || !enrolled) throw enrolError ?? new Error("Failed to enrol TOTP for the E2E admin user.");
    const secret = enrolled.totp.secret;
    const enrolmentWindow = Math.floor(Date.now() / TOTP_STEP_MS);
    const { error: verifyError } = await anon.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(secret) });
    if (verifyError) throw verifyError;
    await anon.auth.signOut({ scope: "local" }).catch(() => undefined);

    await page.goto(`${ADMIN_BASE}/login`);
    await page.getByLabel("Е-пошта").fill(email);
    await page.getByLabel("Лозинка").fill(password);
    await page.getByRole("button", { name: "Најави се" }).click();
    const codeField = page.getByLabel("Код од апликацијата");
    await expect(codeField).toBeVisible();
    // Never reuse the enrolment's code, and never type a code that is about
    // to roll over before the form is submitted.
    await waitForFreshTotpWindow(enrolmentWindow);
    await codeField.fill(totp(secret));
    await page.getByRole("button", { name: "Потврди" }).click();
    await page.waitForURL((url) => url.pathname === "/admin", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Преглед" })).toBeVisible();

    return { email, password, secret, userId };
  } catch (err) {
    await db.auth.admin.deleteUser(userId).catch(() => undefined);
    throw err;
  }
}
