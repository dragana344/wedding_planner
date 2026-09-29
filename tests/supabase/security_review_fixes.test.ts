import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { setMenuItemQuantities } from "@/lib/couple/menu";
import { hashSessionToken } from "@/lib/couple/session-hash";
import { validateAndRenewCoupleSession } from "@/lib/couple/session-verify";
import { PATCH as guestCount } from "@/app/api/couple/guest-count/route";

// Fixes from the pre-launch security review (docs/production/SECURITY-REVIEW.md).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let db: Client;
let venueA: string;
let venueB: string;
let eventA: string;
let dishB: string;
let templateB: string;
let roomB: string;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  const { data: venues } = await admin.from("venues").insert([{ name: "SR Venue A" }, { name: "SR Venue B" }]).select("id");
  [venueA, venueB] = venues!.map((v) => v.id);
  const { data: event } = await admin.from("events").insert({ venue_id: venueA, couple_names: "SR & A", event_date: "2027-12-01" }).select("id").single();
  eventA = event!.id;
  dishB = (await admin.from("menu_items").insert({ venue_id: venueB, tiers: ["everyday"], course: "main", name: "B dish" }).select("id").single()).data!.id;
  templateB = (await admin.from("menu_templates").insert({ venue_id: venueB, name: "B menu" }).select("id").single()).data!.id;
  roomB = (await admin.from("rooms").insert({ venue_id: venueB, name: "B hall" }).select("id").single()).data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().in("id", [venueA, venueB]);
  await db.end();
});

describe("SR-01 couple credentials", () => {
  it("hashes new couple passwords with bcrypt cost 10", async () => {
    await admin.rpc("create_event_credentials", { p_event_id: eventA, p_username: `sr01-${Date.now()}`, p_password: "long-enough-pass" });
    const { rows } = await db.query("select password_hash from event_credentials where event_id = $1", [eventA]);
    expect(rows[0].password_hash).toMatch(/^\$2a\$10\$/);
  });

  it("spends bcrypt time on unknown usernames too (no timing oracle)", async () => {
    const time = async (username: string) => {
      const t = process.hrtime.bigint();
      await db.query("select * from public.verify_event_credentials($1, 'wrong-password-x')", [username]);
      return Number(process.hrtime.bigint() - t) / 1e6;
    };
    const { rows } = await db.query("select username from event_credentials where event_id = $1", [eventA]);
    const known = Math.min(await time(rows[0].username), await time(rows[0].username));
    const unknown = Math.min(await time("nobody-sr01"), await time("nobody-sr01"));
    expect(unknown).toBeGreaterThan(known * 0.5);
  });
});

describe("SR-02 same-venue references", () => {
  it("refuses another venue's dish in a couple's quantities, even through server code", async () => {
    await expect(setMenuItemQuantities(eventA, [{ menu_item_id: dishB, guest_count: 10 }])).rejects.toBeTruthy();
    const { data } = await admin.from("event_menu_item_quantities").select("menu_item_id").eq("event_id", eventA);
    expect(data).toEqual([]);
  });

  it("refuses another venue's menu template or room on an event", async () => {
    expect((await admin.from("events").update({ menu_template_id: templateB }).eq("id", eventA)).error?.code).toBe("23514");
    const { error } = await admin
      .from("event_layout_elements")
      .insert({ event_id: eventA, room_id: roomB, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 });
    expect(error?.code).toBe("23514");
  });
});

describe("SR-04 no raw database errors from contact-info / guest-count", () => {
  it("answers a database failure with the route's own message", async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:59999";
    try {
      const res = await guestCount(
        new NextRequest("http://localhost/api/couple/guest-count", {
          method: "PATCH",
          headers: { "x-couple-event-id": eventA, "content-type": "application/json" },
          body: JSON.stringify({ guest_count_estimate: 50 }),
        }),
        { params: {} },
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Не успеа зачувувањето на бројот на гости." });
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
    }
  }, 30_000);
});

describe("SR-06 couple sessions have an absolute lifetime", () => {
  it("rejects a session older than 90 days even if its sliding expiry is in the future", async () => {
    await admin.from("couple_sessions").insert({
      token: await hashSessionToken("sr06-old-session"),
      event_id: eventA,
      created_at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(await validateAndRenewCoupleSession("sr06-old-session")).toBeNull();
  });
});
