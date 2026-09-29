import { test, expect } from "./fixtures";
import { adminClient, uniqueId } from "./helpers";

// Local Supabase delivers auth email to Mailpit (`supabase status` → MAILPIT_URL).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailpitSearch = { messages_count: number; messages: { Subject: string; To: { Address: string }[] }[] };

async function mailsTo(address: string): Promise<MailpitSearch["messages"]> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  const body = (await res.json()) as MailpitSearch;
  return body.messages ?? [];
}

// Flow 5: "Заборавена лозинка?" on /login sends a reset email.
test("password-reset request sends the reset email", async ({ page }) => {
  const email = `e2e-reset-${uniqueId()}@example.com`;
  const { error } = await adminClient().auth.admin.createUser({
    email,
    password: `Reset-pw-${uniqueId()}`,
    email_confirm: true,
  });
  expect(error).toBeNull();
  expect(await mailsTo(email)).toHaveLength(0);

  await page.goto("/login");
  await page.getByRole("button", { name: "Заборавена лозинка?" }).click();
  await expect(page.getByRole("heading", { name: "Ресетирај лозинка" })).toBeVisible();
  await page.getByLabel("Е-пошта").fill(email);
  await page.getByRole("button", { name: "Испрати линк за ресетирање" }).click();
  await expect(page.locator(".auth-status")).toBeVisible();
  await expect(page.locator(".auth-error")).toHaveCount(0);

  await expect.poll(async () => (await mailsTo(email)).length, { timeout: 20_000 }).toBe(1);
});
