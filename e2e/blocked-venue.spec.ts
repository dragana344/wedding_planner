import { test, expect } from "./fixtures";
import { adminClient, signUpVenue } from "./helpers";

// Admin spec D8: a blocked venue's staff see BlockedScreen on every panel page.
// The pages render nothing without a venue and leave the decision to the
// layout, so they never redirect a blocked user to /login.
test("a blocked venue's staff see the blocked screen on the panel pages", async ({ page }) => {
  const venue = await signUpVenue(page);
  const admin = adminClient();
  const { data, error } = await admin.from("venues").select("id").eq("name", venue.venueName).single();
  expect(error).toBeNull();
  const venueId = data!.id as string;

  try {
    const { error: blockError } = await admin
      .from("venues")
      .update({ blocked_at: new Date().toISOString(), blocked_reason: "E2E блокирање" })
      .eq("id", venueId);
    expect(blockError).toBeNull();

    for (const path of ["/venue", "/venue/events"]) {
      await page.goto(path);
      await expect(page.getByText("Пристапот е привремено оневозможен.")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
    }
  } finally {
    await admin.from("venues").update({ blocked_at: null, blocked_reason: null }).eq("id", venueId);
  }
});
