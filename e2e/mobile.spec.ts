import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { setUpCouple, signUpVenue } from "./helpers";

// D1: every panel page is usable on a 390 px phone — no sideways scrolling of
// the page itself — and the navigation lives in a drawer behind "Мени".

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
// Many pages per test, each prefetching the whole nav: more than the default minute on a busy machine.
test.setTimeout(180_000);

async function expectNoHorizontalScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await page.locator("header.top, main").first().waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
}

test("venue panel fits a phone and opens its menu as a drawer", async ({ page }) => {
  await signUpVenue(page);
  for (const path of [
    "/venue", "/venue/calendar", "/venue/reservations", "/venue/events", "/venue/events/new",
    "/venue/tables", "/venue/clients", "/venue/menus", "/venue/settings", "/venue/support",
  ]) {
    await expectNoHorizontalScroll(page, path);
  }

  await page.goto("/venue");
  const menu = page.getByRole("button", { name: "Мени" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#panel-nav")).not.toBeInViewport();
  await menu.click();
  await expect(page.locator("#panel-nav")).toBeInViewport();
  await page.locator("#panel-nav").getByRole("link", { name: "Резервации" }).click();
  await page.waitForURL("**/venue/reservations");
  await expect(page.locator("#panel-nav")).not.toBeInViewport();
});

test("couple panel and guest album fit a phone", async ({ page, anonPage }) => {
  await setUpCouple(page);
  for (const path of [
    "/couple", "/couple/guests", "/couple/menu", "/couple/agenda", "/couple/locations", "/couple/budget",
    "/couple/checklist", "/couple/notes", "/couple/invitation", "/couple/album", "/couple/greetings", "/couple/album/qr",
  ]) {
    await expectNoHorizontalScroll(page, path);
  }

  await page.goto("/couple/album");
  const guestUrl = new URL((await page.locator(".s4-link").textContent())!);
  await anonPage.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(anonPage, guestUrl.pathname);
});
