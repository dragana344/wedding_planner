import fs from "fs";
import { test, expect } from "./fixtures";
import { setUpCouple } from "./helpers";

// Session 4 acceptance: a guest on a phone opens the album link, uploads ten
// photos and leaves a greeting; the couple sees them, hides one and downloads
// the album as a ZIP.

test("guest uploads photos and a greeting; the couple moderates and downloads", async ({ page, anonPage }) => {
  await setUpCouple(page);
  await page.goto("/couple/album");
  await expect(page.getByText("Сè уште нема фотографии.", { exact: false })).toBeVisible();
  const guestUrl = new URL((await page.locator(".s4-link").textContent())!);

  // The guest, on a phone.
  await anonPage.setViewportSize({ width: 390, height: 844 });
  await anonPage.goto(guestUrl.pathname);
  // A real JPEG from the browser's own encoder, so it can be decoded and re-encoded.
  const dataUrl = await anonPage.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#b8913a";
    ctx.fillRect(0, 0, 640, 480);
    return canvas.toDataURL("image/jpeg", 0.8);
  });
  const JPEG = Buffer.from(dataUrl.split(",")[1], "base64");
  await anonPage.getByLabel("Вашето име (не е задолжително)").fill("Тетка Роса");
  await anonPage.getByLabel(/Се согласувам фотографијата да биде прикажана/).check();
  await anonPage.getByLabel("Изберете фотографии").setInputFiles(
    Array.from({ length: 10 }, (_, i) => ({ name: `IMG_${i}.jpg`, mimeType: "image/jpeg", buffer: JPEG })),
  );
  await expect(anonPage.getByText("10 / 10 прикачени")).toBeVisible({ timeout: 60_000 });
  await expect(anonPage.locator(".ga-error")).toHaveCount(0); // not role=alert: Next's route announcer has it too

  await anonPage.getByLabel("Име", { exact: true }).fill("Ана");
  await anonPage.getByLabel("Презиме", { exact: true }).fill("Петрова");
  await anonPage.getByLabel("Порака").fill("Честито и среќен живот!");
  await anonPage.getByRole("button", { name: "Испрати честитка" }).click();
  await expect(anonPage.getByText("Ви благодариме! Честитката е испратена.")).toBeVisible();

  // The couple.
  await page.reload();
  const photos = page.getByRole("img", { name: "Фотографија од Тетка Роса" });
  await expect(photos).toHaveCount(10);
  const first = page.locator("[data-testid^='photo-']").first();
  await first.getByRole("button", { name: "Скриј" }).click();
  await expect(first.getByText("Скриена")).toBeVisible();

  // Through the link, like the couple would (the session cookie is Secure, so
  // Playwright's API client wouldn't send it over http to 127.0.0.1).
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Преземи ги сите" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^album-\d{4}-\d{2}-\d{2}-del-1\.zip$/);
  const bytes = fs.readFileSync((await download.path())!);
  expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304"); // "PK\x03\x04"

  await page.goto("/couple/album/qr?format=a6&count=4&numbered=1");
  await expect(page.getByText("Скенирај и сподели ги твоите фотографии")).toHaveCount(4);
  await expect(page.getByText("Маса 4")).toBeVisible();

  await page.goto("/couple/greetings");
  await expect(page.getByText("Ана Петрова")).toBeVisible();
  await expect(page.getByText("Честито и среќен живот!")).toBeVisible();
});

test("an unknown album link shows a friendly not-found page", async ({ anonPage }) => {
  await anonPage.goto(`/e/${"x".repeat(24)}`);
  await expect(anonPage.getByRole("heading", { name: "Албумот не постои" })).toBeVisible();
});
