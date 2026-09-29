import { test, expect } from "./fixtures";
import { setUpCouple, signUpVenue } from "./helpers";

// SEC-001: every page of the venue panel, the couple panel and the public
// pages loads without a single Content-Security-Policy violation (the csp
// fixture fails the test otherwise). Also a smoke test that no nav item is
// broken (ARCH-003).

const VENUE_PAGES = [
  "/venue",
  "/venue/calendar",
  "/venue/reservations",
  "/venue/tables",
  "/venue/events",
  "/venue/events/new",
  "/venue/clients",
  "/venue/menus",
  "/venue/settings",
  "/venue/support",
  "/venue/notifications",
  "/venue/messages",
  "/venue/reports",
];

const COUPLE_PAGES = [
  "/couple",
  "/couple/menu",
  "/couple/agenda",
  "/couple/locations",
  "/couple/guests",
  "/couple/budget",
  "/couple/checklist",
  "/couple/notes",
  "/couple/invitation",
  "/couple/greetings",
  "/couple/messages",
  "/couple/album",
];

test("public pages load without CSP violations", async ({ page }) => {
  for (const path of ["/", "/login", "/signup", "/couple/login", "/does-not-exist"]) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBeLessThan(path === "/does-not-exist" ? 500 : 400);
    await page.waitForLoadState("networkidle");
  }
});

test("every venue panel page loads without CSP violations", async ({ page }) => {
  await signUpVenue(page);
  for (const path of VENUE_PAGES) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(200);
    await page.waitForLoadState("networkidle");
  }
});

test("every couple panel page loads without CSP violations", async ({ page }) => {
  await setUpCouple(page);
  for (const path of COUPLE_PAGES) {
    const res = await page.goto(path);
    expect(res!.status(), path).toBe(200);
    await page.waitForLoadState("networkidle");
  }
});
