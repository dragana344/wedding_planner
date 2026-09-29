// tests/supabase/rls_isolation.test.ts
//
// TEST-003: venue RLS isolation across every table the venue panel reads and
// writes from the browser as `authenticated` (the STAFF_TABLES of
// rls_guard.test.ts). Two venues, each with its own staff user, each with a
// full set of rows. Signed in as staff A with the anon key (so RLS applies):
//
//   - select never returns one of venue B's rows,
//   - update / delete of venue B's rows affect nothing (checked by re-reading
//     with the service-role client),
//   - insert of a row that belongs to venue B (or mixes A and B parents) is
//     refused with 42501,
//   - staff A cannot move one of its own rows into venue B,
//   - staff A CAN read every own table and write a representative subset,
//     so the denials above are not vacuous,
//   - the anon role (no session) can do nothing at all.
//
// A table added to STAFF_TABLES without a case here fails the coverage test.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const RUN = `rlsiso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "rls-isolation-password-123";

type Row = Record<string, unknown>;
type Key = Record<string, string>;

interface VenueFixture {
  venueId: string;
  userId: string;
  email: string;
  roomId: string;
  room2Id: string;
  tableTypeId: string;
  menuTemplateId: string;
  menuItemId: string;
  eventId: string;
  showcasePhotoId: string;
  fixedElementId: string;
  roomLayoutElementId: string;
  eventLayoutElementId: string;
  reservationId: string;
}

let A: VenueFixture;
let B: VenueFixture;
let staffA: SupabaseClient;
let anon: SupabaseClient;
const strayVenueIds: string[] = [];

async function one<T extends Row>(table: string, values: Row): Promise<T> {
  const { data, error } = await admin.from(table).insert(values).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}

async function createVenueFixture(tag: "A" | "B"): Promise<VenueFixture> {
  const email = `${RUN}-staff-${tag.toLowerCase()}@test.local`;
  const venue = await one<{ id: string }>("venues", { name: `${RUN} Venue ${tag}` });
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError) throw userError;
  const userId = user.user!.id;
  await one("venue_staff", { user_id: userId, venue_id: venue.id });

  const room = await one<{ id: string }>("rooms", { venue_id: venue.id, name: `${RUN} Room ${tag}` });
  const room2 = await one<{ id: string }>("rooms", { venue_id: venue.id, name: `${RUN} Room ${tag}2` });
  const tableType = await one<{ id: string }>("table_types", {
    room_id: room.id,
    name: `${RUN} Round ${tag}`,
    shape: "round",
    seats: 10,
    width_cm: 180,
    length_cm: 180,
    quantity: 5,
  });
  const template = await one<{ id: string }>("menu_templates", { venue_id: venue.id, name: `${RUN} Menu ${tag}` });
  const item = await one<{ id: string }>("menu_items", {
    venue_id: venue.id,
    course: "main",
    name: `${RUN} Dish ${tag}`,
    tiers: ["special"],
  });
  await one("menu_template_items", { menu_template_id: template.id, menu_item_id: item.id });
  const event = await one<{ id: string }>("events", {
    venue_id: venue.id,
    couple_names: `${RUN} Couple ${tag}`,
    event_date: "2027-07-01",
    menu_template_id: template.id,
  });
  await one("event_rooms", { event_id: event.id, room_id: room.id });
  const photo = await one<{ id: string }>("event_showcase_photos", {
    event_id: event.id,
    photo_path: `${RUN}/${tag}.jpg`,
  });
  await one("event_custom_menu_items", { event_id: event.id, menu_item_id: item.id });
  const fixed = await one<{ id: string }>("room_fixed_elements", {
    room_id: room.id,
    element_type: "pillar",
    x_cm: 10,
    y_cm: 10,
    width_cm: 40,
    height_cm: 40,
  });
  const roomLayout = await one<{ id: string }>("room_layout_elements", {
    room_id: room.id,
    element_type: "table",
    table_type_id: tableType.id,
    x_cm: 200,
    y_cm: 200,
    width_cm: 180,
    length_cm: 180,
  });
  const eventLayout = await one<{ id: string }>("event_layout_elements", {
    event_id: event.id,
    room_id: room.id,
    element_type: "table",
    table_type_id: tableType.id,
    x_cm: 200,
    y_cm: 200,
    width_cm: 180,
    length_cm: 180,
  });
  const reservation = await one<{ id: string }>("reservations", {
    venue_id: venue.id,
    room_id: room.id,
    guest_name: `${RUN} Guest ${tag}`,
    phone: "070000000",
    date: "2027-07-02",
    start_time: "19:00",
    party_size: 4,
  });
  await one("reservation_tables", { reservation_id: reservation.id, layout_element_id: roomLayout.id });

  return {
    venueId: venue.id,
    userId,
    email,
    roomId: room.id,
    room2Id: room2.id,
    tableTypeId: tableType.id,
    menuTemplateId: template.id,
    menuItemId: item.id,
    eventId: event.id,
    showcasePhotoId: photo.id,
    fixedElementId: fixed.id,
    roomLayoutElementId: roomLayout.id,
    eventLayoutElementId: eventLayout.id,
    reservationId: reservation.id,
  };
}

/**
 * One case per STAFF table. `key` picks the fixture's single row; `update` is
 * a harmless change; `inserts` are rows that belong to (or reach into) the
 * other venue and must be refused.
 */
interface TableCase {
  table: string;
  key: (f: VenueFixture) => Key;
  update: (own: VenueFixture) => Row;
  inserts: (own: VenueFixture, other: VenueFixture) => Row[];
}

const CASES: TableCase[] = [
  {
    table: "venues",
    key: (f) => ({ id: f.venueId }),
    update: () => ({ name: "hijacked" }),
    // No insert policy: nobody but service role creates venues.
    inserts: () => [{ name: `${RUN} stray venue` }],
  },
  {
    table: "venue_staff",
    key: (f) => ({ user_id: f.userId }),
    update: (own) => ({ venue_id: own.venueId }),
    // Assignment is service-role only; staff A cannot attach itself to B.
    inserts: (own, other) => [{ user_id: own.userId, venue_id: other.venueId }],
  },
  {
    table: "rooms",
    key: (f) => ({ id: f.roomId }),
    update: () => ({ name: "hijacked" }),
    inserts: (_own, other) => [{ venue_id: other.venueId, name: "stray" }],
  },
  {
    table: "table_types",
    key: (f) => ({ id: f.tableTypeId }),
    update: () => ({ name: "hijacked" }),
    inserts: (_own, other) => [
      { room_id: other.roomId, name: "stray", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 1 },
    ],
  },
  {
    table: "menu_templates",
    key: (f) => ({ id: f.menuTemplateId }),
    update: () => ({ name: "hijacked" }),
    inserts: (_own, other) => [{ venue_id: other.venueId, name: "stray" }],
  },
  {
    table: "menu_items",
    key: (f) => ({ id: f.menuItemId }),
    update: () => ({ name: "hijacked" }),
    inserts: (_own, other) => [{ venue_id: other.venueId, course: "main", name: "stray", tiers: ["special"] }],
  },
  {
    table: "menu_template_items",
    key: (f) => ({ menu_template_id: f.menuTemplateId, menu_item_id: f.menuItemId }),
    update: (own) => ({ menu_item_id: own.menuItemId }),
    inserts: (own, other) => [
      { menu_template_id: other.menuTemplateId, menu_item_id: other.menuItemId },
      // Own template, other venue's dish.
      { menu_template_id: own.menuTemplateId, menu_item_id: other.menuItemId },
      // Other venue's template, own dish.
      { menu_template_id: other.menuTemplateId, menu_item_id: own.menuItemId },
    ],
  },
  {
    table: "events",
    key: (f) => ({ id: f.eventId }),
    update: () => ({ couple_names: "hijacked", total_price: 1 }),
    inserts: (_own, other) => [{ venue_id: other.venueId, couple_names: "stray", event_date: "2027-01-01" }],
  },
  {
    table: "event_rooms",
    key: (f) => ({ event_id: f.eventId, room_id: f.roomId }),
    update: () => ({ layout_initialized_at: new Date().toISOString() }),
    inserts: (own, other) => [
      { event_id: other.eventId, room_id: other.room2Id },
      // Own event, other venue's room.
      { event_id: own.eventId, room_id: other.room2Id },
      // Other venue's event, own room.
      { event_id: other.eventId, room_id: own.room2Id },
    ],
  },
  {
    table: "event_showcase_photos",
    key: (f) => ({ id: f.showcasePhotoId }),
    update: () => ({ photo_path: "hijacked.jpg" }),
    inserts: (_own, other) => [{ event_id: other.eventId, photo_path: "stray.jpg" }],
  },
  {
    table: "event_custom_menu_items",
    key: (f) => ({ event_id: f.eventId, menu_item_id: f.menuItemId }),
    update: (own) => ({ menu_item_id: own.menuItemId }),
    // Select-only for staff; the couple API writes these with service role.
    inserts: (own, other) => [
      { event_id: other.eventId, menu_item_id: other.menuItemId },
      { event_id: own.eventId, menu_item_id: own.menuItemId },
    ],
  },
  {
    table: "room_fixed_elements",
    key: (f) => ({ id: f.fixedElementId }),
    update: () => ({ label: "hijacked" }),
    inserts: (_own, other) => [
      { room_id: other.roomId, element_type: "wall", x_cm: 0, y_cm: 0, width_cm: 10, height_cm: 10 },
    ],
  },
  {
    table: "room_layout_elements",
    key: (f) => ({ id: f.roomLayoutElementId }),
    update: () => ({ label: "hijacked" }),
    inserts: (_own, other) => [
      { room_id: other.roomId, element_type: "stage", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 },
    ],
  },
  {
    table: "event_layout_elements",
    key: (f) => ({ id: f.eventLayoutElementId }),
    update: () => ({ label: "hijacked" }),
    inserts: (_own, other) => [
      {
        event_id: other.eventId,
        room_id: other.roomId,
        element_type: "stage",
        x_cm: 0,
        y_cm: 0,
        width_cm: 100,
        length_cm: 100,
      },
    ],
  },
  {
    table: "reservations",
    key: (f) => ({ id: f.reservationId }),
    update: () => ({ note: "hijacked", party_size: 99 }),
    inserts: (own, other) => [
      {
        venue_id: other.venueId,
        room_id: other.roomId,
        guest_name: "stray",
        phone: "1",
        date: "2027-01-01",
        start_time: "12:00",
        party_size: 2,
      },
      // Own venue id, other venue's room.
      {
        venue_id: own.venueId,
        room_id: other.roomId,
        guest_name: "stray",
        phone: "1",
        date: "2027-01-01",
        start_time: "12:00",
        party_size: 2,
      },
    ],
  },
  {
    table: "reservation_tables",
    key: (f) => ({ reservation_id: f.reservationId, layout_element_id: f.roomLayoutElementId }),
    update: (own) => ({ layout_element_id: own.roomLayoutElementId }),
    inserts: (own, other) => [
      { reservation_id: other.reservationId, layout_element_id: other.roomLayoutElementId },
      // Own reservation, other venue's table.
      { reservation_id: own.reservationId, layout_element_id: other.roomLayoutElementId },
    ],
  },
];

function matches(row: Row, key: Key): boolean {
  return Object.entries(key).every(([k, v]) => row[k] === v);
}

type Eqable = { eq: (column: string, value: string) => Eqable };

/** Applies `.eq(column, value)` for every column of the key. */
function filtered<Q>(query: Q, key: Key): Q {
  let q = query as unknown as Eqable;
  for (const [k, v] of Object.entries(key)) q = q.eq(k, v);
  return q as unknown as Q;
}

async function adminRead(table: string, key: Key): Promise<Row[]> {
  const { data, error } = await filtered(admin.from(table).select("*"), key);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as Row[];
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  [A, B] = await Promise.all([createVenueFixture("A"), createVenueFixture("B")]);
  staffA = await signIn(A.email);
  anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}, 60_000);

afterAll(async () => {
  await staffA?.auth.signOut();
  for (const f of [A, B]) if (f) await admin.auth.admin.deleteUser(f.userId);
  const venueIds = [A?.venueId, B?.venueId, ...strayVenueIds].filter(Boolean) as string[];
  if (venueIds.length) await admin.from("venues").delete().in("id", venueIds);
});

describe("RLS isolation (TEST-003)", () => {
  it("covers every STAFF table from rls_guard (and nothing else)", async () => {
    // The authoritative list: tables `authenticated` holds a grant on.
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await db.connect();
    try {
      const { rows } = await db.query<{ table_name: string }>(`
        select distinct table_name from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'authenticated' order by 1`);
      // audit_log is select-only for staff (no CRUD to isolate); its venue
      // scoping is tested in audit_log.test.ts.
      const READ_ONLY_TESTED_ELSEWHERE = new Set(["audit_log"]);
      expect(CASES.map((c) => c.table).sort()).toEqual(
        rows.map((r) => r.table_name).filter((t) => !READ_ONLY_TESTED_ELSEWHERE.has(t)).sort(),
      );
    } finally {
      await db.end();
    }
  });

  describe.each(CASES)("$table", (c) => {
    it("staff A sees its own row but none of venue B's", async () => {
      const { data: all, error } = await staffA.from(c.table).select("*");
      expect(error).toBeNull();
      const rows = all as Row[];
      expect(rows.some((r) => matches(r, c.key(A))), "own row visible").toBe(true);
      expect(rows.filter((r) => matches(r, c.key(B)))).toEqual([]);

      const { data: direct } = await filtered(staffA.from(c.table).select("*"), c.key(B));
      expect(direct ?? []).toEqual([]);
    });

    it("staff A cannot update venue B's row", async () => {
      const before = await adminRead(c.table, c.key(B));
      expect(before).toHaveLength(1);
      const { data } = await filtered(staffA.from(c.table).update(c.update(A)), c.key(B)).select();
      expect(data ?? []).toEqual([]);
      expect(await adminRead(c.table, c.key(B))).toEqual(before);
    });

    it("staff A cannot delete venue B's row", async () => {
      const before = await adminRead(c.table, c.key(B));
      expect(before).toHaveLength(1);
      const { data } = await filtered(staffA.from(c.table).delete(), c.key(B)).select();
      expect(data ?? []).toEqual([]);
      expect(await adminRead(c.table, c.key(B))).toEqual(before);
    });

    it("staff A cannot insert a row into venue B", async () => {
      for (const values of c.inserts(A, B)) {
        const { data, error } = await staffA.from(c.table).insert(values).select();
        if (c.table === "venues" && data) strayVenueIds.push(...(data as { id: string }[]).map((v) => v.id));
        // 42501: RLS refused it; 23514: the same-venue reference trigger
        // (migration 0045) refused it first. Either way nothing is written.
        expect(["42501", "23514"], `${c.table} insert ${JSON.stringify(values)}`).toContain(error?.code);
      }
    });

    it("anon can neither read nor write it", async () => {
      const { data: rows } = await anon.from(c.table).select("*");
      expect(rows ?? []).toEqual([]);

      for (const f of [A, B]) {
        const before = await adminRead(c.table, c.key(f));
        await filtered(anon.from(c.table).update(c.update(f)), c.key(f));
        await filtered(anon.from(c.table).delete(), c.key(f));
        expect(await adminRead(c.table, c.key(f))).toEqual(before);
      }

      for (const values of [...c.inserts(A, B), ...c.inserts(B, A)]) {
        const { data, error } = await anon.from(c.table).insert(values).select();
        if (c.table === "venues" && data) strayVenueIds.push(...(data as { id: string }[]).map((v) => v.id));
        expect(error?.code, `${c.table} anon insert`).toBe("42501");
      }
    });
  });

  describe("staff A cannot move its own rows into venue B", () => {
    it.each([
      ["rooms", () => ({ id: A.roomId }), () => ({ venue_id: B.venueId })],
      ["menu_templates", () => ({ id: A.menuTemplateId }), () => ({ venue_id: B.venueId })],
      ["menu_items", () => ({ id: A.menuItemId }), () => ({ venue_id: B.venueId })],
      ["events", () => ({ id: A.eventId }), () => ({ venue_id: B.venueId })],
      ["table_types", () => ({ id: A.tableTypeId }), () => ({ room_id: B.roomId })],
      ["room_fixed_elements", () => ({ id: A.fixedElementId }), () => ({ room_id: B.roomId })],
      ["room_layout_elements", () => ({ id: A.roomLayoutElementId }), () => ({ room_id: B.roomId })],
      ["event_layout_elements", () => ({ id: A.eventLayoutElementId }), () => ({ event_id: B.eventId })],
      ["event_showcase_photos", () => ({ id: A.showcasePhotoId }), () => ({ event_id: B.eventId })],
      ["reservations", () => ({ id: A.reservationId }), () => ({ venue_id: B.venueId, room_id: B.roomId })],
      [
        "event_rooms",
        () => ({ event_id: A.eventId, room_id: A.roomId }),
        () => ({ room_id: B.room2Id }),
      ],
    ] as [string, () => Key, () => Row][])("%s", async (table, key, patch) => {
      const before = await adminRead(table, key());
      expect(before).toHaveLength(1);
      const { error } = await filtered(staffA.from(table).update(patch()), key());
      expect(["42501", "23514"]).toContain(error?.code);
      expect(await adminRead(table, key())).toEqual(before);
    });
  });

  describe("staff A can still manage its own venue (non-vacuous)", () => {
    it("inserts, updates and deletes its own rooms, table types, menus, events and reservations", async () => {
      const { data: room, error: roomError } = await staffA
        .from("rooms")
        .insert({ venue_id: A.venueId, name: `${RUN} own room` })
        .select()
        .single();
      expect(roomError).toBeNull();

      const { error: ttError } = await staffA.from("table_types").insert({
        room_id: room!.id,
        name: "own",
        shape: "rectangular",
        seats: 6,
        width_cm: 80,
        length_cm: 200,
        quantity: 2,
      });
      expect(ttError).toBeNull();

      const { data: item, error: itemError } = await staffA
        .from("menu_items")
        .insert({ venue_id: A.venueId, course: "dessert", name: `${RUN} own dessert`, tiers: ["everyday"] })
        .select()
        .single();
      expect(itemError).toBeNull();
      const { error: mtiError } = await staffA
        .from("menu_template_items")
        .insert({ menu_template_id: A.menuTemplateId, menu_item_id: item!.id });
      expect(mtiError).toBeNull();

      const { error: erError } = await staffA.from("event_rooms").insert({ event_id: A.eventId, room_id: A.room2Id });
      expect(erError).toBeNull();

      const { data: res, error: resError } = await staffA
        .from("reservations")
        .insert({
          venue_id: A.venueId,
          room_id: A.roomId,
          guest_name: "own",
          phone: "2",
          date: "2027-08-01",
          start_time: "13:00",
          party_size: 3,
        })
        .select()
        .single();
      expect(resError).toBeNull();

      const { data: updatedEvents } = await staffA
        .from("events")
        .update({ guest_count_estimate: 120 })
        .eq("id", A.eventId)
        .select();
      expect(updatedEvents).toHaveLength(1);

      const { data: updatedVenue } = await staffA.from("venues").update({ name: `${RUN} Venue A renamed` }).eq("id", A.venueId).select();
      expect(updatedVenue).toHaveLength(1);

      const { data: deletedRes } = await staffA.from("reservations").delete().eq("id", res!.id).select();
      expect(deletedRes).toHaveLength(1);
      const { data: deletedRoom } = await staffA.from("rooms").delete().eq("id", room!.id).select();
      expect(deletedRoom).toHaveLength(1);
    });
  });
});
