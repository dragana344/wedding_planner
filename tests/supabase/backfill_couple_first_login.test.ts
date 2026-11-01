import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

// 0128: couples who logged in before change marks shipped have a null
// couple_first_login_at and would see no marks until they log in again. The
// migration already ran on `migration up`, so this re-runs the migration's own
// statement (idempotent) against fresh rows: an event with a session gets a
// value, one without a session stays null, an existing value never moves.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const SQL = readFileSync(path.join(process.cwd(), "supabase/migrations/0128_backfill_couple_first_login.sql"), "utf8");
const stamp = Date.now();
let db: Client;
let venueId: string;

async function newEvent(name: string, firstLogin: string | null = null): Promise<string> {
  const { data, error } = await admin.from("events").insert({ venue_id: venueId, couple_names: name, event_date: "2030-05-01", couple_first_login_at: firstLogin }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function addSession(eventId: string) {
  const { error } = await admin.from("couple_sessions").insert({ token: `backfill-${eventId}`, event_id: eventId, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
  if (error) throw error;
}

async function firstLogin(eventId: string): Promise<string | null> {
  const { data, error } = await admin.from("events").select("couple_first_login_at").eq("id", eventId).single();
  if (error) throw error;
  return data.couple_first_login_at as string | null;
}

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  venueId = (await admin.from("venues").insert({ name: `Backfill first login ${stamp}` }).select("id").single()).data!.id;
});

afterAll(async () => {
  await db.end();
  if (venueId) await admin.from("venues").delete().eq("id", venueId);
});

describe("0128 backfill couple_first_login_at", () => {
  it("sets it for events with a couple session, leaves the rest alone", async () => {
    const loggedIn = await newEvent("Најавени");
    const never = await newEvent("Ненајавени");
    const earlier = "2026-01-01T10:00:00+00:00";
    const already = await newEvent("Веќе", earlier);
    await addSession(loggedIn);
    await addSession(already);

    await db.query(SQL);

    expect(await firstLogin(loggedIn)).not.toBeNull();
    expect(await firstLogin(never)).toBeNull();
    expect(Date.parse((await firstLogin(already))!)).toBe(Date.parse(earlier));
  });
});
