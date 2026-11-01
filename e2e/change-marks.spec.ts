import { test, expect } from "./fixtures";
import { adminClient, createEventWithCouple, elevateAsOwner, futureDate, loginCouple, signUpVenue, uniqueId } from "./helpers";

// The cron route is called with the secret playwright.config.ts gives both the
// app and the test workers.
const CRON_SECRET = process.env.CRON_SECRET!;

function skopjeDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Skopje" });
}

// Venue → couple marks (date), couple → venue marks (guest count), and the
// cron's automatic send of the final menu numbers.
test("change marks both ways, Видено, and the automatic menu send", async ({ page, anonPage, request }) => {
  const admin = adminClient();
  const account = await signUpVenue(page);
  const couple = await createEventWithCouple(page, account);
  const { data: event } = await admin.from("events").select("id").eq("couple_names", couple.coupleNames).single();

  // The couple signs in once: only changes after this count as marks.
  await loginCouple(anonPage, couple);
  await anonPage.goto("/couple");
  await expect(anonPage.getByRole("region", { name: "Датум и време" })).toHaveCount(0);

  // The venue manager changes the date.
  await page.goto("/venue/events");
  await elevateAsOwner(page, account);
  await page.getByRole("searchbox", { name: "Пребарај настан" }).fill(couple.coupleNames);
  await page.getByRole("button", { name: `Отвори ${couple.coupleNames}` }).click();
  await page.locator("#edit-event-date").fill(futureDate());
  await page.getByRole("button", { name: "Зачувај промени" }).click();
  await expect(page.locator("#edit-event-date")).toHaveCount(0);

  // The couple sees the notice and the notifications item, and presses Видено.
  await anonPage.goto("/couple");
  const notice = anonPage.getByRole("region", { name: "Датум и време" });
  await expect(notice).toBeVisible();
  await anonPage.goto("/couple/notifications");
  await expect(anonPage.getByText("Датум и време").first()).toBeVisible();
  await anonPage.goto("/couple");
  await notice.getByRole("button", { name: "Видено" }).click();
  await expect(anonPage.getByRole("region", { name: "Датум и време" })).toHaveCount(0);

  // The couple changes the guest count.
  await anonPage.getByRole("button", { name: "Промени број на гости" }).click();
  await anonPage.getByRole("spinbutton", { name: "Број на гости" }).fill("123");
  await anonPage.getByRole("spinbutton", { name: "Број на гости" }).press("Enter");
  await expect(anonPage.getByText("Зачувано")).toBeVisible();

  // The venue sees the marker, the nav badge, and the box in the event window.
  await page.goto("/venue/events");
  await elevateAsOwner(page, account);
  await page.getByRole("searchbox", { name: "Пребарај настан" }).fill(couple.coupleNames);
  const row = page.getByRole("button", { name: `Отвори ${couple.coupleNames}` });
  await expect(row.locator(".change-mark")).toBeVisible();
  await expect(page.getByLabel("1 настани со промени")).toBeVisible();
  await row.click();
  const box = page.locator(".change-box", { has: page.getByText("Променето") });
  await expect(box).toBeVisible();
  await box.getByRole("button", { name: "Видено" }).click();
  await expect(page.locator(".change-box")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(row.locator(".change-mark")).toHaveCount(0);

  // Auto-send: 15 days out, created 30 days ago, one menu linked, nothing sent.
  const { data: venue } = await admin.from("venues").select("id").eq("name", account.venueName).single();
  const id = uniqueId();
  const { data: tpl } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: `Мени ${id}` }).select("id").single();
  await admin.from("event_menu_templates").insert({ event_id: event!.id, menu_template_id: tpl!.id });
  const { error: updateError } = await admin
    .from("events")
    .update({ event_date: skopjeDate(15), created_at: new Date(Date.now() - 30 * 86_400_000).toISOString() })
    .eq("id", event!.id);
  expect(updateError).toBeNull();

  const res = await request.get("/api/cron/reminders", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  // runDueReminders returns [] without mail configured (e2e), so the route answers 200.
  expect(res.status()).toBe(200);
  const { count } = await admin
    .from("event_menu_submissions")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event!.id);
  expect(count).toBe(1);

  await page.goto("/venue/events");
  await elevateAsOwner(page, account);
  await page.getByRole("searchbox", { name: "Пребарај настан" }).fill(couple.coupleNames);
  await page.getByRole("button", { name: `Отвори ${couple.coupleNames}` }).click();
  await expect(page.getByText("Испратено автоматски — непотполно")).toBeVisible();
});
