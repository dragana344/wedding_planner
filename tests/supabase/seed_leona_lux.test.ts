import { describe, it, expect, afterAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { createClient } from "@supabase/supabase-js";

// S3 task 8 (B8): scripts/seed-leona-lux-layout.mjs builds the Leona Lux demo
// hall from "visual image 4" — locally only, unless explicitly allowed.

const run = promisify(execFile);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const VENUE = `Leona Lux test ${Date.now()}`;

function seed(args: string[], env: Record<string, string | undefined> = {}) {
  return run("node", ["scripts/seed-leona-lux-layout.mjs", ...args], {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      ...env,
    },
  });
}

async function hall() {
  const { data: venue } = await admin.from("venues").select("id").eq("name", VENUE).single();
  const { data: room } = await admin.from("rooms").select("id, width_cm, height_cm").eq("venue_id", venue!.id).eq("name", "Голема сала").single();
  const { data: layout } = await admin.from("room_layout_elements").select("element_type, table_role, label").eq("room_id", room!.id);
  const { data: fixed } = await admin.from("room_fixed_elements").select("element_type").eq("room_id", room!.id);
  return { venueId: venue!.id, room: room!, layout: layout!, fixed: fixed! };
}

afterAll(async () => {
  await admin.from("venues").delete().eq("name", VENUE);
});

describe("seed-leona-lux-layout", () => {
  it("builds 40 guest tables, the couple's table, 5 pillars and the hall zones", async () => {
    await seed(["--venue-name", VENUE]);
    const { layout, fixed, room } = await hall();
    const tables = layout.filter((e) => e.element_type === "table");
    expect(tables.filter((t) => t.table_role === "guest")).toHaveLength(40);
    expect(tables.filter((t) => t.table_role === "couple")).toHaveLength(1);
    expect(new Set(tables.map((t) => t.label)).size).toBe(41); // labels follow the sketch's numbers
    expect(fixed.filter((f) => f.element_type === "pillar")).toHaveLength(5);
    expect(fixed.filter((f) => f.element_type === "entrance")).toHaveLength(1);
    for (const type of ["music", "photo_stage", "dance_floor"]) {
      expect(layout.filter((e) => e.element_type === type), type).toHaveLength(1);
    }
    expect(room.width_cm).toBeGreaterThan(room.height_cm);
  }, 60_000);

  it("is idempotent", async () => {
    await seed(["--venue-name", VENUE]);
    const { layout, fixed } = await hall();
    expect(layout.filter((e) => e.element_type === "table")).toHaveLength(41);
    expect(fixed).toHaveLength(6);
    const { data: venues } = await admin.from("venues").select("id").eq("name", VENUE);
    expect(venues).toHaveLength(1);
  }, 60_000);

  it("refuses a non-local database unless explicitly allowed", async () => {
    await expect(seed(["--venue-name", VENUE], { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).rejects.toMatchObject({
      stderr: expect.stringContaining("--allow-remote"),
    });
    await expect(
      seed(["--allow-remote"], { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("--venue-id") });
  });
});
