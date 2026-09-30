import { randomUUID } from "crypto";
import { test, expect } from "./fixtures";
import { ADMIN_BASE, adminClient, createAdminAndSignIn, setUpCouple, uniqueId } from "./helpers";

// End-to-end admin flow (task 4.3): host routing, mandatory-TOTP login, plan
// creation, applying a plan to a venue (locking a feature the venue used to
// have), and unlocking that feature again for a single event via an
// event-level override — probing the couple API before/after each change.

test("main host never serves /admin", async ({ page }) => {
  const res = await page.goto("/admin");
  expect(res!.status()).toBe(404);
});

test("admin builds a plan, locks seating for a venue, then unlocks it for one event", async ({ page, browser, baseURL }) => {
  // The couple lives in its own browser context — a real staff/couple
  // session, separate from the admin's — same pattern as the app's other
  // cross-role E2E flows.
  // Signing the admin in may wait up to ~40 s for a fresh TOTP window
  // (e2e/helpers.ts createAdminAndSignIn), on top of the flow itself.
  test.slow();
  const coupleContext = await browser.newContext({ baseURL });
  const couplePage = await coupleContext.newPage();
  const couple = await setUpCouple(couplePage);

  const db = adminClient();
  const { data: event, error: eventError } = await db
    .from("events")
    .select("id, venue_id")
    .eq("couple_names", couple.coupleNames)
    .single();
  if (eventError || !event) throw eventError ?? new Error("E2E event not found after setUpCouple.");

  const { data: defaultPlan, error: defaultPlanError } = await db.from("plans").select("id").eq("is_default", true).single();
  if (defaultPlanError || !defaultPlan) throw defaultPlanError ?? new Error("No default plan found.");

  // Schema-valid body for POST /api/couple/seating/elements (lib/api/schemas.ts's
  // seatingElementCreateBody): the feature gate runs after body validation, so
  // an invalid body would 400 before ever reaching the gate and the locked/
  // unlocked assertions below would be meaningless. The room doesn't need to
  // exist — a real room only matters for the write to fully succeed, not for
  // telling a 403 (locked) apart from anything else (unlocked).
  const seatingBody = () => ({
    room_id: randomUUID(),
    element_type: "other" as const,
    x_cm: 0,
    y_cm: 0,
    width_cm: 10,
    length_cm: 10,
  });

  // couplePage.request (Playwright's Node-side API client, distinct from the
  // real Chromium network stack) strips the couple_session cookie before
  // sending: it's `Secure`, and unlike Chromium itself — which has a
  // developer exemption allowing Secure cookies over http://127.0.0.1 —
  // Playwright's own HTTP client applies the strict rule (Secure ⇒ https
  // only) and silently drops it, always answering 401. An in-page fetch runs
  // through the real browser and its cookie jar instead, exactly like the
  // couple's own browser would.
  async function postSeatingElement(): Promise<{ status: number; error?: string }> {
    return couplePage.evaluate(async (body) => {
      const res = await fetch("/api/couple/seating/elements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      return { status: res.status, error: json?.error };
    }, seatingBody());
  }

  let admin: Awaited<ReturnType<typeof createAdminAndSignIn>> | null = null;
  let planId: string | null = null;

  try {
    admin = await createAdminAndSignIn(page);

    // Step 1: create a plan that unlocks a handful of features but not
    // seating (components/admin/CreatePlanForm.tsx — real label/button text,
    // not the brief's guessed "Име на нивото"/"Креирај").
    await page.goto(`${ADMIN_BASE}/plans`);
    const planName = `Basic ${uniqueId()}`;
    await page.getByLabel("Име", { exact: true }).fill(planName);
    await page.getByRole("button", { name: "Додади ниво" }).click();
    await page.waitForURL((url) => /^\/admin\/plans\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 30_000 });
    planId = page.url().split("/").pop()!;

    for (const label of ["Дигитална покана и RSVP", "Буџет", "Чеклиста", "Агенда", "Локации", "Белешки"]) {
      await page.getByLabel(label, { exact: true }).check();
    }
    // "Зачувај" also labels the Basic-fields save button above (Основни);
    // scope to the features panel so the click can't hit the wrong one.
    const featuresPanel = page.locator("section.panel", { hasText: "Функции и лимити" });
    await featuresPanel.getByRole("button", { name: "Зачувај" }).click();
    await expect(page.getByText("Зачувано.")).toBeVisible();

    // Step 2: put the venue on the new plan (components/admin/VenueAdminPanels.tsx's
    // real "Ниво" select, id="venue-plan" — matches the brief exactly).
    await page.goto(`${ADMIN_BASE}/venues/${event.venue_id}`);
    await page.getByLabel("Ниво", { exact: true }).selectOption({ label: planName });
    await expect(page.getByText("Зачувано.")).toBeVisible();

    const locked = await postSeatingElement();
    expect(locked.status).toBe(403);
    expect(locked.error).toBe("Оваа функција не е вклучена во вашиот пакет.");

    // Step 3: unlock seating for this one event only, via an event-level
    // override (components/admin/FeatureOverridesEditor.tsx — real
    // aria-labels, matching the brief).
    await page.goto(`${ADMIN_BASE}/events/${event.id}`);
    await page.getByLabel("Распоред на седење", { exact: true }).selectOption("on");
    await page.getByLabel("Белешка за Распоред на седење", { exact: true }).fill("e2e договор");
    await page.getByRole("button", { name: "Зачувај Распоред на седење" }).click();
    await expect(page.getByText("Зачувано.")).toBeVisible();

    const unlocked = await postSeatingElement();
    expect(unlocked.status).not.toBe(403);
  } finally {
    // The shared local DB is reused by every E2E run: the venue this test
    // created stays (same as every other flow in this suite — none of them
    // reset the DB), but the plan it created must not linger, and a venue
    // can't keep pointing at a plan about to be deleted (plan_id is `on
    // delete restrict`).
    if (planId) {
      await db.from("venues").update({ plan_id: defaultPlan.id }).eq("id", event.venue_id);
      await db.from("plans").delete().eq("id", planId);
    }
    if (admin) await db.auth.admin.deleteUser(admin.userId);
    await coupleContext.close();
  }
});
