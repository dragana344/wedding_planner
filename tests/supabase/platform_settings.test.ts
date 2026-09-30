import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { peekMaintenanceMode, refreshMaintenanceMode, invalidateMaintenanceCache } from "@/lib/platform-settings";
import { proxy } from "@/proxy";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
afterAll(async () => {
  await admin.from("platform_settings").update({ maintenance_mode: false }).eq("id", true);
  invalidateMaintenanceCache();
});

describe("maintenance flag in the database (spec §5 item 7)", () => {
  it("turns the maintenance page on for the main site but not the admin host, once the cache has refreshed", async () => {
    // proxy.ts's hot path never awaits the database (controller ruling) — it
    // only reads the synchronous cache, so this test warms that cache
    // itself via the same refresh function proxy() triggers in the
    // background, rather than expecting a single proxy() call right after
    // the write to already reflect it (see maintenance-hot-path.test.ts for
    // that "never awaits" guarantee, exercised with a mocked module).
    //
    // The local test DB is shared (other sessions, and vitest's own
    // parallel worker files, all read it concurrently), so flipping this
    // flag on for the whole suite's duration could hand an unrelated
    // in-flight request an unexpected 503. Reset it the moment this test's
    // own assertions are done, in a `finally`, rather than only in the
    // file's `afterAll` (which would otherwise leave it on for as long as
    // the next test takes too).
    await admin.from("platform_settings").update({ maintenance_mode: true }).eq("id", true);
    invalidateMaintenanceCache();
    try {
      expect(await refreshMaintenanceMode()).toBe(true);
      expect(peekMaintenanceMode()).toBe(true);
      expect((await proxy(new NextRequest("http://localhost:3000/", { headers: { host: "localhost:3000" } }))).status).toBe(503);
      expect((await proxy(new NextRequest("http://admin.localhost:3000/", { headers: { host: "admin.localhost:3000" } }))).status).toBe(200);
    } finally {
      await admin.from("platform_settings").update({ maintenance_mode: false }).eq("id", true);
      invalidateMaintenanceCache();
    }
  });

  it("fails open — keeps the last known value, or false if cold — when the database is unreachable", async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:59999";
    invalidateMaintenanceCache();
    try {
      expect(await refreshMaintenanceMode()).toBe(false);
      expect(peekMaintenanceMode()).toBe(false);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
      invalidateMaintenanceCache();
    }
  }, 20_000);
});
