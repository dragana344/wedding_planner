// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { exportEventData } from "@/lib/privacy/export";

// 0125: every change to an event's planning details (date/time, rooms, menus,
// guest count, contact, finance) is recorded with the side that made it, so
// the other side can be shown what changed since they last looked.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const OTHER_EMAIL = `changes-other-${stamp}@test.local`;
const OWN_EMAIL = `changes-own-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

let venueId: string;
let otherVenueId: string;
let hallA: string; // Сала А
let hallB: string; // Тераса
let menuA: string; // Класично
let menuB: string; // Посно
let soupId: string;
let fishId: string;
const usersToClean: string[] = [];
let ownStaff: SupabaseClient;
let otherStaff: SupabaseClient;

type Change = {
  section: string; side: string; changed_by: string | null; field: string; old_value: unknown; new_value: unknown; changed_at: string;
};

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>;
}

async function newEvent(fields: Record<string, unknown> = {}): Promise<string> {
  const row = await must(
    admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: "Ана и Марко", event_date: "2030-06-01", start_time: "18:00", end_time: "23:00", guest_count_estimate: 100, ...fields })
      .select("id")
      .single(),
  );
  return row.id as string;
}

async function changes(eventId: string): Promise<Change[]> {
  return must(
    admin.from("event_changes").select("section, side, changed_by, field, old_value, new_value, changed_at").eq("event_id", eventId).order("changed_at"),
  ) as Promise<Change[]>;
}

async function clearChanges(eventId: string) {
  await must(admin.from("event_changes").delete().eq("event_id", eventId));
}

function updateFull(eventId: string, over: Record<string, unknown> = {}) {
  return admin.rpc("update_event_full", {
    p_event_id: eventId, p_venue_id: venueId, p_couple_names: "Ана и Марко", p_event_date: "2030-06-01",
    p_start_time: "18:00", p_end_time: "23:00", p_event_type: "wedding", p_status: "preparation",
    p_guest_count_estimate: 100, p_room_ids: [], p_added_menu_ids: [], p_removed_menu_ids: [], ...over,
  });
}

async function staffClient(email: string, venue: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  usersToClean.push(data.user!.id);
  await must(admin.from("venue_staff").insert({ user_id: data.user!.id, venue_id: venue }));
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  // A failed sign-in would leave an anon client, which is refused too: the
  // refusal tests below would then pass for the wrong reason.
  const signIn = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw signIn.error;
  return c;
}

async function dish(name: string): Promise<string> {
  const row = await must(
    admin.from("menu_items")
      .insert({ venue_id: venueId, tiers: ["special"], course: "main", name, allergen_tags: [], is_vegetarian: false, is_vegan: false, price: 10 })
      .select("id")
      .single(),
  );
  return row.id as string;
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: `Changes ${stamp}` }).select("id").single())).id;
  otherVenueId = (await must(admin.from("venues").insert({ name: `Changes other ${stamp}` }).select("id").single())).id;
  hallA = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала А" }).select("id").single())).id;
  hallB = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Тераса" }).select("id").single())).id;
  menuA = (await must(admin.from("menu_templates").insert({ venue_id: venueId, name: "Класично" }).select("id").single())).id;
  menuB = (await must(admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select("id").single())).id;
  soupId = await dish("Супа");
  fishId = await dish("Риба");
  ownStaff = await staffClient(OWN_EMAIL, venueId);
  otherStaff = await staffClient(OTHER_EMAIL, otherVenueId);
}, 60_000);

afterAll(async () => {
  for (const id of usersToClean) await admin.auth.admin.deleteUser(id);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("venue-side recording", () => {
  it("update_event_full changing date and guest count records date_time and guest_count", async () => {
    const e = await newEvent();
    await clearChanges(e);
    expect(await must(updateFull(e, { p_event_date: "2030-07-01", p_end_time: "23:30", p_guest_count_estimate: 120 }))).toBe(true);
    const rows = await changes(e);
    expect(rows.map((r) => r.section).sort()).toEqual(["date_time", "guest_count"]);
    for (const r of rows) {
      expect(r.side).toBe("venue");
      expect(r.changed_by).toBeNull();
      expect(r.field).toBe(r.section);
    }
    expect(rows.find((r) => r.section === "date_time")).toMatchObject({
      old_value: { date: "2030-06-01", start: "18:00:00", end: "23:00:00" },
      new_value: { date: "2030-07-01", start: "18:00:00", end: "23:30:00" },
    });
    expect(rows.find((r) => r.section === "guest_count")).toMatchObject({ old_value: { count: 100 }, new_value: { count: 120 } });

    // Saving the same values again records nothing.
    await clearChanges(e);
    await must(updateFull(e, { p_event_date: "2030-07-01", p_end_time: "23:30", p_guest_count_estimate: 120 }));
    expect(await changes(e)).toEqual([]);
  });

  it("records rooms added and removed with their names", async () => {
    const e = await newEvent();
    await must(updateFull(e, { p_room_ids: [hallA] }));
    await clearChanges(e);
    await must(updateFull(e, { p_room_ids: [hallB] }));
    const rows = await changes(e);
    expect(rows).toHaveLength(2);
    expect(rows.map(({ section, side, field, old_value, new_value }) => ({ section, side, field, old_value, new_value }))).toEqual(
      expect.arrayContaining([
        { section: "rooms", side: "venue", field: "removed", old_value: { id: hallA, name: "Сала А" }, new_value: null },
        { section: "rooms", side: "venue", field: "added", old_value: null, new_value: { id: hallB, name: "Тераса" } },
      ]),
    );
  });

  it("records menu links added and removed", async () => {
    const e = await newEvent();
    await must(updateFull(e, { p_added_menu_ids: [menuA] }));
    await clearChanges(e);
    await must(updateFull(e, { p_added_menu_ids: [menuB], p_removed_menu_ids: [menuA] }));
    const rows = await changes(e);
    expect(rows.map(({ section, field, old_value, new_value }) => ({ section, field, old_value, new_value }))).toEqual(
      expect.arrayContaining([
        { section: "menus", field: "removed", old_value: { id: menuA, name: "Класично", custom: false }, new_value: null },
        { section: "menus", field: "added", old_value: null, new_value: { id: menuB, name: "Посно", custom: false } },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("records a custom menu's link, rename and dish change", async () => {
    const e = await newEvent();
    const custom = (await must(admin.from("menu_templates").insert({ venue_id: venueId, event_id: e, name: "Наше мени" }).select("id").single())).id;
    await must(admin.from("event_menu_templates").insert({ event_id: e, menu_template_id: custom }));
    await must(admin.rpc("replace_menu_template_items", { p_template_id: custom, p_item_ids: [soupId] }));
    let rows = await changes(e);
    expect(rows.find((r) => r.field === "added")).toMatchObject({ section: "menus", new_value: { id: custom, name: "Наше мени", custom: true } });
    expect(rows.find((r) => r.field === "dishes")).toMatchObject({
      section: "menus", side: "venue", old_value: { menu: "Наше мени", dishes: [] }, new_value: { menu: "Наше мени", dishes: ["Супа"] },
    });

    await clearChanges(e);
    await must(admin.from("menu_templates").update({ name: "Свечено мени" }).eq("id", custom));
    await must(admin.rpc("replace_menu_template_items", { p_template_id: custom, p_item_ids: [fishId, soupId] }));
    // Same dishes again: nothing to record.
    await must(admin.rpc("replace_menu_template_items", { p_template_id: custom, p_item_ids: [soupId, fishId] }));
    rows = await changes(e);
    expect(rows.map(({ section, field, old_value, new_value }) => ({ section, field, old_value, new_value }))).toEqual([
      { section: "menus", field: "renamed", old_value: { name: "Наше мени" }, new_value: { name: "Свечено мени" } },
      { section: "menus", field: "dishes", old_value: { menu: "Свечено мени", dishes: ["Супа"] }, new_value: { menu: "Свечено мени", dishes: ["Риба", "Супа"] } },
    ]);
  });

  it("does not record standard package edits", async () => {
    const e = await newEvent();
    await must(updateFull(e, { p_added_menu_ids: [menuA] }));
    await clearChanges(e);
    await must(admin.from("menu_templates").update({ name: "Класично 2" }).eq("id", menuA));
    await must(admin.rpc("replace_menu_template_items", { p_template_id: menuA, p_item_ids: [soupId] }));
    await must(admin.from("menu_templates").update({ name: "Класично" }).eq("id", menuA));
    expect(await changes(e)).toEqual([]);
  });

  it("a direct service-role finance update records finance on the venue side", async () => {
    const e = await newEvent({ total_price: 1000 });
    await clearChanges(e);
    await must(admin.from("events").update({ deposit_paid: 200 }).eq("id", e));
    const rows = await changes(e);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      section: "finance", side: "venue", field: "finance", old_value: { total: 1000, deposit: null }, new_value: { total: 1000, deposit: 200 },
    });
  });
});

describe("couple-side RPCs", () => {
  it("couple_set_guest_count records side couple with changed_by", async () => {
    const e = await newEvent();
    await clearChanges(e);
    await must(admin.rpc("couple_set_guest_count", { p_event_id: e, p_count: 140, p_changed_by: "Младенците" }));
    expect((await must(admin.from("events").select("guest_count_estimate").eq("id", e).single())).guest_count_estimate).toBe(140);
    const rows = await changes(e);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ section: "guest_count", side: "couple", changed_by: "Младенците", old_value: { count: 100 }, new_value: { count: 140 } });

    // The setting is transaction-local: a later plain update is the venue's again.
    await must(admin.from("events").update({ guest_count_estimate: 150 }).eq("id", e));
    expect((await changes(e))[1]).toMatchObject({ side: "venue", changed_by: null });
  });

  it("couple_set_contact_info records side couple with changed_by", async () => {
    const e = await newEvent({ contact_email: "old@test.local" });
    await clearChanges(e);
    await must(
      admin.rpc("couple_set_contact_info", { p_event_id: e, p_email: "new@test.local", p_email_2: null, p_phone: "070111222", p_changed_by: "Ко-организатор" }),
    );
    const rows = await changes(e);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      section: "contact", side: "couple", changed_by: "Ко-организатор", field: "contact",
      old_value: { email: "old@test.local", email_2: null, phone: null },
      new_value: { email: "new@test.local", email_2: null, phone: "070111222" },
    });
  });

  it("record_couple_first_login sets once and never moves", async () => {
    const e = await newEvent();
    const read = async () => (await must(admin.from("events").select("couple_first_login_at").eq("id", e).single())).couple_first_login_at as string | null;
    expect(await read()).toBeNull();
    await must(admin.rpc("record_couple_first_login", { p_event_id: e }));
    const first = await read();
    expect(first).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    await must(admin.rpc("record_couple_first_login", { p_event_id: e }));
    expect(await read()).toBe(first);
  });

  it("the couple RPCs are not callable by staff", async () => {
    const e = await newEvent();
    expect((await ownStaff.rpc("couple_set_guest_count", { p_event_id: e, p_count: 1, p_changed_by: "x" })).error?.code).toBe("42501");
    expect((await ownStaff.rpc("record_couple_first_login", { p_event_id: e })).error?.code).toBe("42501");
    expect((await ownStaff.from("event_changes").select("id")).error?.code).toBe("42501");
  });
});

describe("erasure and deletion", () => {
  it("erase_event_personal_data records nothing and nulls existing contact values", async () => {
    const e = await newEvent({ contact_email: "a@test.local", contact_phone: "070" });
    await clearChanges(e);
    await must(admin.rpc("couple_set_contact_info", { p_event_id: e, p_email: "b@test.local", p_email_2: null, p_phone: "071", p_changed_by: "Младенците" }));
    await must(admin.rpc("couple_set_guest_count", { p_event_id: e, p_count: 90, p_changed_by: "Младенците" }));
    await must(admin.from("event_change_seen").insert({ event_id: e, viewer: "venue", section: "contact", seen_up_to: new Date().toISOString(), seen_by: "Менаџер" }));
    await must(admin.from("event_couple_reminders").insert({ event_id: e, reminded_by: "Менаџер" }));

    expect(await must(admin.rpc("erase_event_personal_data", { p_event_id: e }))).toBe(true);
    const rows = await changes(e);
    expect(rows).toHaveLength(2);
    const contact = rows.find((r) => r.section === "contact")!;
    expect(contact.old_value).toBeNull();
    expect(contact.new_value).toBeNull();
    expect(rows.find((r) => r.section === "guest_count")).toMatchObject({ old_value: { count: 100 }, new_value: { count: 90 } });
    for (const r of rows) expect(r.changed_by).toBeNull();
    expect((await must(admin.from("event_change_seen").select("seen_by").eq("event_id", e)))).toEqual([{ seen_by: null }]);
    expect(await must(admin.from("event_couple_reminders").select("id").eq("event_id", e))).toEqual([]);
  });

  it("deleting the event leaves no rows and does not error", async () => {
    const e = await newEvent();
    await must(updateFull(e, { p_room_ids: [hallA], p_added_menu_ids: [menuA] }));
    const custom = (await must(admin.from("menu_templates").insert({ venue_id: venueId, event_id: e, name: "Сопствено" }).select("id").single())).id;
    await must(admin.from("event_menu_templates").insert({ event_id: e, menu_template_id: custom }));
    expect((await changes(e)).length).toBeGreaterThan(0);
    await must(admin.from("events").delete().eq("id", e));
    expect(await changes(e)).toEqual([]);
  });

  it("create_event_full still creates an event", async () => {
    const id = await must(
      admin.rpc("create_event_full", {
        p_venue_id: venueId, p_couple_names: "Нов пар", p_event_date: "2030-09-01", p_start_time: "18:00", p_end_time: "23:00",
        p_event_type: "wedding", p_status: "preparation", p_guest_count_estimate: 50, p_room_ids: [hallA], p_contact_email: null,
        p_contact_email_2: null, p_contact_phone: null, p_total_price: null, p_deposit_paid: null, p_username: `changes-${stamp}`, p_password: "long-enough-password",
        p_menu_template_ids: [menuA],
      }),
    );
    expect(typeof id).toBe("string");
  });

  it("exports the event's change log", async () => {
    const e = await newEvent();
    await must(admin.rpc("couple_set_contact_info", { p_event_id: e, p_email: "export@test.local", p_email_2: null, p_phone: null, p_changed_by: "Младенците" }));
    const data = await exportEventData(e);
    expect(data!.change_log).toEqual([expect.objectContaining({ section: "contact", new_value: { email: "export@test.local", email_2: null, phone: null } })]);
  });
});

describe("venue_unseen_change_sections", () => {
  async function unseen(client: SupabaseClient = admin) {
    return client.rpc("venue_unseen_change_sections", { p_venue_id: venueId });
  }
  async function sectionsFor(eventId: string, client: SupabaseClient = admin): Promise<string[]> {
    const data = (await must(unseen(client))) as { event_id: string; section: string }[];
    return data.filter((r) => r.event_id === eventId).map((r) => r.section).sort();
  }

  it("returns a couple change until the venue has seen it", async () => {
    const e = await newEvent();
    await must(updateFull(e, { p_guest_count_estimate: 110 })); // venue's own change: never a mark
    expect(await sectionsFor(e)).toEqual([]);
    await must(admin.rpc("couple_set_guest_count", { p_event_id: e, p_count: 130, p_changed_by: "Младенците" }));
    expect(await sectionsFor(e)).toEqual(["guest_count"]);
    expect(await sectionsFor(e, ownStaff)).toEqual(["guest_count"]);

    const [latest] = await changes(e).then((r) => r.slice(-1));
    await must(admin.from("event_change_seen").upsert({ event_id: e, viewer: "venue", section: "guest_count", seen_up_to: latest.changed_at }));
    expect(await sectionsFor(e)).toEqual([]);
  });

  it("ignores past events", async () => {
    const e = await newEvent({ event_date: "2020-01-01" });
    await must(admin.rpc("couple_set_guest_count", { p_event_id: e, p_count: 130, p_changed_by: "Младенците" }));
    expect(await sectionsFor(e)).toEqual([]);
  });

  it("returns menu_numbers for an unseen couple submission only", async () => {
    const e = await newEvent();
    const base = { event_id: e, sent_by: "Младенците", counts: {}, menu_titles: {}, total: 0 };
    await must(admin.from("event_menu_submissions").insert({ ...base, source: "venue", seen_at: null }));
    expect(await sectionsFor(e)).toEqual([]);
    await must(admin.from("event_menu_submissions").insert({ ...base, sent_at: new Date(Date.now() + 1000).toISOString() }));
    expect(await sectionsFor(e)).toEqual(["menu_numbers"]);
    const subs = await must(admin.from("event_menu_submissions").select("source, unanswered").eq("event_id", e));
    expect(subs.map((s) => s.source).sort()).toEqual(["couple", "venue"]);
    expect(subs.every((s) => s.unanswered === null)).toBe(true);
  });

  it("refuses staff of another venue", async () => {
    expect((await unseen(otherStaff)).error?.code).toBe("42501");
    // The same call works for this venue's own staff (so the refusal is about the venue, not the sign-in).
    expect((await unseen(ownStaff)).error).toBeNull();
  });
});
