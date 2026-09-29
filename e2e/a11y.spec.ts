import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { adminClient, setUpCouple, signUpVenue, uniqueId } from "./helpers";

// TEST-007: automated accessibility audit (axe, WCAG 2.1 A/AA) of the key
// screens. Every screen's full result is attached to the report and serious/
// critical issues are printed. Rollout per the task: warn now; set
// A11Y_STRICT=1 (CI) to fail on them once the findings in
// docs/production/A11Y.md are fixed.

async function audit(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  await test.info().attach(`axe-${name}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join(", ")}`);
  for (const line of blocking) console.log(`[a11y] ${name}: ${line}`);
  test.info().annotations.push(...blocking.map((description) => ({ type: `a11y:${name}`, description })));
  if (process.env.A11Y_STRICT === "1") expect.soft(blocking, `${name}:\n${blocking.join("\n")}`).toEqual([]);
}

test("public screens", async ({ page }) => {
  for (const [path, name] of [
    ["/", "marketing"],
    ["/login", "login"],
    ["/signup", "signup"],
    ["/couple/login", "couple-login"],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }
});

test("venue panel screens", async ({ page }) => {
  await signUpVenue(page);
  for (const [path, name] of [
    ["/venue", "venue-dashboard"],
    ["/venue/events/new", "venue-new-event"],
    ["/venue/reservations", "venue-reservations"],
    ["/venue/settings", "venue-settings"],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }
});

test("couple panel and public invitation", async ({ page, anonPage }) => {
  const couple = await setUpCouple(page);
  for (const [path, name] of [
    ["/couple", "couple-home"],
    ["/couple/guests", "couple-guests"],
    ["/couple/invitation", "couple-invitation"],
  ] as const) {
    await page.goto(path);
    await audit(page, name);
  }

  const admin = adminClient();
  const { data: event } = await admin.from("events").select("id").eq("couple_names", couple.coupleNames).single();
  const slug = `a11y${uniqueId()}`.slice(0, 20);
  await admin.from("event_invitations").insert({ event_id: event!.id, template_id: "romantic-floral", public_slug: slug });
  await anonPage.goto(`/invite/${slug}`);
  await audit(anonPage, "invitation");
});
