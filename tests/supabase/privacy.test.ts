import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { exportEventData, exportVenueData } from "@/lib/privacy/export";
import { ERASED_COUPLE_NAMES, deleteVenueAccount, eraseEventPersonalData } from "@/lib/privacy/erase";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import { COLUMN_CLASSIFICATION } from "./privacy-classification";

// DATA-005 / DATA-006 / DATA-007: export returns the subject's data and
// nobody else's; erasure and account deletion leave no personal data in the
// database or storage; every action writes an audit row without PII; the
// retention purge works with explicit periods.

// The venue privacy routes authenticate through the cookie-bound server
// client; here it is a supabase-js client signed in as the test's staff user.
const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => session.client }));

import { GET as exportRoute } from "@/app/api/venue/privacy/export/route";
import { POST as eraseRoute } from "@/app/api/venue/privacy/erase-event/route";
import { POST as deleteRoute } from "@/app/api/venue/privacy/delete-account/route";

// Each test seeds whole events (rows + photos); give them room under a full suite run.
vi.setConfig({ testTimeout: 30_000 });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let db: Client;
const venuesToClean: string[] = [];
const usersToClean: string[] = [];

const png = () => new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

async function put(bucket: string, path: string) {
  const { error } = await admin.storage.from(bucket).upload(path, png(), { upsert: true });
  if (error) throw error;
}

async function objectExists(bucket: string, path: string): Promise<boolean> {
  const { rows } = await db.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, path]);
  return rows.length > 0;
}

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>;
}

type Venue = { venueId: string; roomId: string; name: string };

async function newVenue(tag: string): Promise<Venue> {
  const name = `Privacy Venue ${tag} ${stamp}`;
  const venue = await must(admin.from("venues").insert({ name }).select("id").single());
  venuesToClean.push(venue.id);
  const room = await must(admin.from("rooms").insert({ venue_id: venue.id, name: "Hall" }).select("id").single());
  return { venueId: venue.id, roomId: room.id, name };
}

async function newStaff(venueIds: string[]): Promise<{ userId: string; email: string; client: SupabaseClient }> {
  const email = `privacy-${randomUUID()}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  usersToClean.push(data.user.id);
  for (const venueId of venueIds) await must(admin.from("venue_staff").insert({ user_id: data.user.id, venue_id: venueId }));
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: "test-password-123" });
  return { userId: data.user.id, email, client };
}

type SeededEvent = { eventId: string; tag: string; invitationPath: string; oldInvitationPath: string; showcasePath: string; checklistId: string };

/** One event with a row in every personal-data table, each carrying `tag`. */
async function seedEvent(v: Venue, tag: string, eventDate = "2027-06-01"): Promise<SeededEvent> {
  const event = await must(
    admin
      .from("events")
      .insert({
        venue_id: v.venueId,
        couple_names: `Couple ${tag}`,
        event_date: eventDate,
        contact_email: `${tag}@couple.test`,
        contact_phone: `070-${tag}`,
        total_price: 1000,
        seating_draft: { [v.roomId]: [{ label: `Draft ${tag}` }] },
      })
      .select("id")
      .single(),
  );
  const eventId = event.id as string;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: v.roomId }));
  await must(admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `user-${tag}`, p_password: "long-enough-password" }));
  await must(admin.from("couple_sessions").insert({ token: `tok-${tag}`, event_id: eventId, expires_at: new Date(Date.now() + 86_400_000).toISOString() }));
  await must(admin.from("event_guests").insert({ event_id: eventId, full_name: `Guest ${tag}`, phone: `071-${tag}`, notes: `Allergy ${tag}` }));
  await must(admin.from("event_notes").insert({ event_id: eventId, title: `Note ${tag}`, content: `Content ${tag}` }));
  await must(admin.from("event_agenda_items").insert({ event_id: eventId, title: `Agenda ${tag}`, sort_order: 0 }));
  await must(admin.from("event_locations").insert({ event_id: eventId, label: `Home ${tag}`, address: `Street ${tag}` }));
  await must(admin.from("event_budget_items").insert({ event_id: eventId, category: "other", name: `Vendor ${tag}`, paid_amount: 10 }));
  const checklist = await must(admin.from("event_checklist_items").insert({ event_id: eventId, title: `Task ${tag}` }).select("id").single());
  await must(admin.from("event_checklist_subtasks").insert({ checklist_item_id: checklist.id, title: `Subtask ${tag}` }));
  const dish = await must(
    admin.from("menu_items").insert({ venue_id: v.venueId, tiers: ["everyday"], course: "main", name: `Dish ${tag}` }).select("id").single(),
  );
  await must(admin.from("event_custom_menu_items").insert({ event_id: eventId, menu_item_id: dish.id }));
  await must(admin.from("event_menu_item_quantities").insert({ event_id: eventId, menu_item_id: dish.id, guest_count: 7 }));
  await must(
    admin.from("event_layout_elements").insert({
      event_id: eventId, room_id: v.roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100, label: `Table ${tag}`,
    }),
  );

  const invitationPath = `${eventId}-2.png`;
  const oldInvitationPath = `${eventId}-1.png`; // replaced earlier: no row points at it
  const showcasePath = `${v.venueId}/${eventId}-1.png`;
  await put("invitation-photos", invitationPath);
  await put("invitation-photos", oldInvitationPath);
  await put("event-showcase-photos", showcasePath);
  await must(
    admin.from("event_invitations").insert({
      event_id: eventId, template_id: "classic", public_slug: `priv-${tag}-${stamp}`, message: `Welcome ${tag}`, photo_path: invitationPath,
    }),
  );
  await must(admin.from("event_showcase_photos").insert({ event_id: eventId, photo_path: showcasePath }));
  return { eventId, tag, invitationPath, oldInvitationPath, showcasePath, checklistId: checklist.id };
}

async function auditRows(filter: Record<string, string>) {
  let q = admin.from("audit_log").select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  return (await q).data ?? [];
}

/** Rows of every classified table that still hold personal/secret values for the event. */
async function remainingPersonalData(eventId: string, checklistId: string): Promise<string[]> {
  const leftovers: string[] = [];
  for (const [table, columns] of Object.entries(COLUMN_CLASSIFICATION)) {
    const sensitive = Object.entries(columns)
      .filter(([, c]) => c === "personal" || c === "secret")
      .map(([name]) => name);
    if (sensitive.length === 0) continue;
    let where: string;
    let param = eventId;
    if (table === "events") where = "id = $1";
    else if ("event_id" in columns) where = "event_id = $1";
    else if ("checklist_item_id" in columns) {
      where = "checklist_item_id = $1";
      param = checklistId;
    } else continue;
    const notEmpty = sensitive
      .map((c) => {
        if (table === "events" && c === "couple_names") return `couple_names <> '${ERASED_COUPLE_NAMES}'`;
        if (table === "events" && c.startsWith("seating_draft")) return `${c} <> '{}'::jsonb`;
        return `${c} is not null`;
      })
      .join(" or ");
    const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${where} and (${notEmpty})`, [param]);
    if (rows[0].n > 0) leftovers.push(table);
  }
  return leftovers;
}

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
});

afterAll(async () => {
  for (const id of usersToClean) await admin.auth.admin.deleteUser(id);
  await admin.from("venues").delete().in("id", venuesToClean);
  await admin.from("contact_submissions").delete().like("email", `%-${stamp}@privacy.test`);
  await drainStorageCleanupQueue();
  await db.end();
});

describe("export (DATA-005)", () => {
  it("returns the venue's personal data, and no other venue's, with no secrets", async () => {
    const a = await newVenue("A");
    const b = await newVenue("B");
    const staff = await newStaff([a.venueId]);
    const eventA = await seedEvent(a, `ea${stamp}`);
    await seedEvent(b, `eb${stamp}`);
    await must(
      admin.from("reservations").insert({
        venue_id: a.venueId, room_id: a.roomId, guest_name: `Booker ${stamp}`, phone: "072", date: "2027-01-01", start_time: "19:00",
        party_size: 2,
      }),
    );

    const data = await exportVenueData(a.venueId, { actorId: staff.userId });
    const json = JSON.stringify(data);
    for (const text of [
      `Couple ${eventA.tag}`, `${eventA.tag}@couple.test`, `user-${eventA.tag}`, `Guest ${eventA.tag}`, `Allergy ${eventA.tag}`,
      `Content ${eventA.tag}`, `Agenda ${eventA.tag}`, `Street ${eventA.tag}`, `Vendor ${eventA.tag}`, `Subtask ${eventA.tag}`,
      `Welcome ${eventA.tag}`, `Dish ${eventA.tag}`, `Table ${eventA.tag}`, eventA.invitationPath, eventA.showcasePath,
      `Booker ${stamp}`, staff.email, a.name,
    ]) {
      expect(json, text).toContain(text);
    }
    expect(data!.events[0].invitation?.photo_url).toContain(`/invitation-photos/${eventA.invitationPath}`);
    expect(json).not.toContain(`eb${stamp}`);
    expect(json).not.toContain(b.name);
    expect(json).not.toContain("password_hash");
    expect(json).not.toContain("layout_lock_password_hash");
    expect(json).not.toContain(`tok-${eventA.tag}`);
    expect(json).not.toMatch(/\$2[aby]\$/); // no bcrypt hash anywhere

    const [row] = await auditRows({ venue_id: a.venueId, action: "privacy_export" });
    expect(row).toMatchObject({ actor_type: "staff", actor_id: staff.userId });
    expect(JSON.stringify(row)).not.toContain(eventA.tag);
  });

  it("exports one event without the venue's other events", async () => {
    const v = await newVenue("E");
    const one = await seedEvent(v, `one${stamp}`);
    await seedEvent(v, `two${stamp}`);
    const data = await exportEventData(one.eventId);
    const json = JSON.stringify(data);
    expect(json).toContain(`Guest one${stamp}`);
    expect(json).toContain(`Subtask one${stamp}`);
    expect(json).not.toContain(`two${stamp}`);
    expect(await exportEventData(randomUUID())).toBeNull();
  });
});

describe("event erasure (DATA-005)", () => {
  it("removes every personal value and file of the event, keeps the event row, and audits it", async () => {
    const v = await newVenue("X");
    const target = await seedEvent(v, `x${stamp}`);
    const other = await seedEvent(v, `y${stamp}`);
    const staff = await newStaff([v.venueId]);

    expect(await eraseEventPersonalData(target.eventId, { actorId: staff.userId })).toBe(true);

    expect(await remainingPersonalData(target.eventId, target.checklistId)).toEqual([]);
    const event = await must(admin.from("events").select("*").eq("id", target.eventId).single());
    expect(event).toMatchObject({ couple_names: ERASED_COUPLE_NAMES, event_date: "2027-06-01", total_price: 1000, contact_email: null });
    expect(event.personal_data_erased_at).not.toBeNull();
    expect((await admin.from("event_rooms").select("room_id").eq("event_id", target.eventId)).data).toHaveLength(1);
    expect((await admin.from("event_layout_elements").select("id").eq("event_id", target.eventId)).data).toHaveLength(1);

    expect(await objectExists("invitation-photos", target.invitationPath)).toBe(false);
    expect(await objectExists("invitation-photos", target.oldInvitationPath)).toBe(false);
    expect(await objectExists("event-showcase-photos", target.showcasePath)).toBe(false);

    // The other event is untouched.
    expect(await remainingPersonalData(other.eventId, other.checklistId)).toContain("event_guests");
    expect(await objectExists("invitation-photos", other.invitationPath)).toBe(true);

    const rows = await auditRows({ event_id: target.eventId, action: "event_personal_data_erased" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_type: "staff", actor_id: staff.userId, venue_id: v.venueId, details: { reason: "request" } });
    expect(JSON.stringify(rows[0])).not.toContain(target.tag);
  });

  it("returns false for an unknown event", async () => {
    expect(await eraseEventPersonalData(randomUUID())).toBe(false);
  });
});

describe("venue account deletion (DATA-005)", () => {
  it("deletes the venue, all its data and files, and its staff logins, leaving other venues alone", async () => {
    const v = await newVenue("D");
    const keep = await newVenue("K");
    const onlyHere = await newStaff([v.venueId]);
    const otherVenueStaff = await newStaff([keep.venueId]);
    const kept = await seedEvent(keep, `k${stamp}`);
    const seeded = await seedEvent(v, `d${stamp}`);
    const menuPath = `${v.venueId}/dish-${stamp}.png`;
    await put("menu-item-photos", menuPath);
    const strayPath = `${v.venueId}/stray-${stamp}.png`; // no row points at it
    await put("event-showcase-photos", strayPath);
    await must(admin.from("menu_items").insert({ venue_id: v.venueId, tiers: ["everyday"], course: "main", name: "Photo dish", photo_path: menuPath }));
    await must(
      admin.from("reservations").insert({
        venue_id: v.venueId, room_id: v.roomId, guest_name: `Booker d${stamp}`, phone: "072", date: "2027-01-01", start_time: "19:00", party_size: 2,
      }),
    );

    expect(await deleteVenueAccount(v.venueId, { actorId: onlyHere.userId })).toBe(true);

    expect((await admin.from("venues").select("id").eq("id", v.venueId)).data).toEqual([]);
    for (const table of Object.keys(COLUMN_CLASSIFICATION)) {
      const cols = COLUMN_CLASSIFICATION[table];
      if ("venue_id" in cols && table !== "audit_log") {
        const { rows } = await db.query(`select count(*)::int as n from public.${table} where venue_id = $1`, [v.venueId]);
        expect(rows[0].n, table).toBe(0);
      }
      if ("event_id" in cols && table !== "audit_log") {
        const { rows } = await db.query(`select count(*)::int as n from public.${table} where event_id = $1`, [seeded.eventId]);
        expect(rows[0].n, table).toBe(0);
      }
    }
    const { rows: queued } = await db.query("select count(*)::int as n from public.storage_cleanup_queue where path like $1 or path like $2", [
      `${v.venueId}/%`, `${seeded.eventId}-%`,
    ]);
    expect(queued[0].n).toBe(0);
    for (const [bucket, path] of [
      ["invitation-photos", seeded.invitationPath],
      ["invitation-photos", seeded.oldInvitationPath],
      ["event-showcase-photos", seeded.showcasePath],
      ["event-showcase-photos", strayPath],
      ["menu-item-photos", menuPath],
    ]) {
      expect(await objectExists(bucket, path), `${bucket}/${path}`).toBe(false);
    }

    expect((await admin.auth.admin.getUserById(onlyHere.userId)).data.user).toBeNull();
    expect((await admin.auth.admin.getUserById(otherVenueStaff.userId)).data.user).not.toBeNull();
    expect((await admin.from("venue_staff").select("venue_id").eq("user_id", otherVenueStaff.userId)).data).toEqual([{ venue_id: keep.venueId }]);
    expect(await remainingPersonalData(kept.eventId, kept.checklistId)).toContain("event_guests");
    expect(await objectExists("invitation-photos", kept.invitationPath)).toBe(true);

    const rows = await auditRows({ venue_id: v.venueId, action: "venue_account_deleted" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_type: "staff", actor_id: onlyHere.userId, details: { events: 1, staff_accounts: 1 } });
    expect(JSON.stringify(rows[0])).not.toContain(v.name);
  });
});

describe("retention purge mechanism (DATA-007)", () => {
  it("erases events older than the guest-data period and deletes old contact messages", async () => {
    const v = await newVenue("R");
    // 100-year periods: only these deliberately ancient rows qualify, so the
    // shared local database's other data is never touched.
    const ancient = await seedEvent(v, `old${stamp}`, "1920-05-01");
    const recent = await seedEvent(v, `new${stamp}`, "1990-05-01");
    await must(admin.from("contact_submissions").insert({ name: "Old", email: `old-${stamp}@privacy.test`, message: "hi", created_at: "1920-01-01T00:00:00Z" }));
    await must(admin.from("contact_submissions").insert({ name: "New", email: `new-${stamp}@privacy.test`, message: "hi" }));

    const result = await must(admin.rpc("purge_expired_personal_data", { p_guest_data_months: 1200, p_contact_months: 1200 }));
    expect(result).toEqual({ events_erased: 1, contact_submissions_deleted: 1 });
    await drainStorageCleanupQueue();

    expect(await remainingPersonalData(ancient.eventId, ancient.checklistId)).toEqual([]);
    expect(await remainingPersonalData(recent.eventId, recent.checklistId)).toContain("event_guests");
    expect((await admin.from("contact_submissions").select("name").like("email", `%-${stamp}@privacy.test`)).data).toEqual([{ name: "New" }]);
    expect(await objectExists("invitation-photos", ancient.invitationPath)).toBe(false);

    const [erased] = await auditRows({ event_id: ancient.eventId, action: "event_personal_data_erased" });
    expect(erased).toMatchObject({ actor_type: "system", details: { reason: "retention" } });

    // Already-erased events are skipped on the next run.
    const again = await must(admin.rpc("purge_expired_personal_data", { p_guest_data_months: 1200, p_contact_months: 1200 }));
    expect(again).toEqual({ events_erased: 0, contact_submissions_deleted: 0 });
  });

  it("rejects missing or non-positive periods", async () => {
    expect((await admin.rpc("purge_expired_personal_data", { p_guest_data_months: 0, p_contact_months: 24 })).error).not.toBeNull();
    expect((await admin.rpc("purge_expired_personal_data", { p_guest_data_months: 12, p_contact_months: null })).error).not.toBeNull();
  });

  it("is callable by neither anon nor signed-in staff (nor are the erasure functions)", async () => {
    const v = await newVenue("P");
    const staff = await newStaff([v.venueId]);
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    for (const client of [anon, staff.client]) {
      expect((await client.rpc("purge_expired_personal_data", { p_guest_data_months: 1200, p_contact_months: 1200 })).error).not.toBeNull();
      expect((await client.rpc("delete_venue_account", { p_venue_id: v.venueId })).error).not.toBeNull();
      expect((await client.rpc("erase_event_personal_data", { p_event_id: randomUUID() })).error).not.toBeNull();
    }
    expect((await admin.from("venues").select("id").eq("id", v.venueId)).data).toHaveLength(1);
  });
});

describe("venue privacy routes (DATA-006)", () => {
  const post = (path: string, body: unknown) =>
    new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("refuse callers who are not signed-in staff", async () => {
    session.client = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await exportRoute(new NextRequest("http://localhost/api/venue/privacy/export"))).status).toBe(401);
    expect((await eraseRoute(post("/api/venue/privacy/erase-event", { event_id: randomUUID(), confirm: "x" }), { params: {} })).status).toBe(401);
    expect((await deleteRoute(post("/api/venue/privacy/delete-account", { confirm: "x" }), { params: {} })).status).toBe(401);
  });

  it("export downloads the caller's venue as a JSON attachment", async () => {
    const v = await newVenue("RE");
    const staff = await newStaff([v.venueId]);
    const seeded = await seedEvent(v, `re${stamp}`);
    session.client = staff.client;
    const res = await exportRoute(new NextRequest("http://localhost/api/venue/privacy/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="podatoci-\d{4}-\d{2}-\d{2}\.json"$/);
    const body = await res.json();
    expect(body.venue.id).toBe(v.venueId);
    expect(JSON.stringify(body)).toContain(`Guest ${seeded.tag}`);
  });

  it("erase-event needs the exact couple names and only works on the caller's own events", async () => {
    const v = await newVenue("RX");
    const other = await newVenue("RO");
    const staff = await newStaff([v.venueId]);
    const mine = await seedEvent(v, `rx${stamp}`);
    const theirs = await seedEvent(other, `ro${stamp}`);
    session.client = staff.client;

    const wrong = await eraseRoute(post("/api/venue/privacy/erase-event", { event_id: mine.eventId, confirm: "couple rx" }), { params: {} });
    expect(wrong.status).toBe(400);
    const foreign = await eraseRoute(post("/api/venue/privacy/erase-event", { event_id: theirs.eventId, confirm: `Couple ${theirs.tag}` }), { params: {} });
    expect(foreign.status).toBe(404);
    expect(await remainingPersonalData(theirs.eventId, theirs.checklistId)).toContain("event_guests");

    const ok = await eraseRoute(post("/api/venue/privacy/erase-event", { event_id: mine.eventId, confirm: ` Couple ${mine.tag} ` }), { params: {} });
    expect(ok.status).toBe(200);
    expect(await remainingPersonalData(mine.eventId, mine.checklistId)).toEqual([]);
  });

  it("delete-account needs the exact venue name", async () => {
    const v = await newVenue("RD");
    const staff = await newStaff([v.venueId]);
    session.client = staff.client;

    const wrong = await deleteRoute(post("/api/venue/privacy/delete-account", { confirm: v.name.toUpperCase() }), { params: {} });
    expect(wrong.status).toBe(400);
    expect((await admin.from("venues").select("id").eq("id", v.venueId)).data).toHaveLength(1);

    const ok = await deleteRoute(post("/api/venue/privacy/delete-account", { confirm: v.name }), { params: {} });
    expect(ok.status).toBe(200);
    expect((await admin.from("venues").select("id").eq("id", v.venueId)).data).toEqual([]);
    expect((await admin.auth.admin.getUserById(staff.userId)).data.user).toBeNull();
  });
});
