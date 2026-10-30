import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { setMenuTemplateItems } from "@/lib/venue/menus";

// 0119: event-only menus (menu_templates.event_id), per-guest menu counts and
// the couple's menu submissions to the venue.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `event-menus-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

let venueA: string;
let venueB: string;
let userId: string;
let eventA: string;
let eventB: string;
let guestId: string;
let standardId: string; // standard template of venue A
let customId: string; // event-only menu of eventA
let dishId: string;
let staff: SupabaseClient;

async function event(venue: string, names: string): Promise<string> {
  const { data, error } = await admin
    .from("events")
    .insert({ venue_id: venue, couple_names: names, event_date: "2030-06-01" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  venueA = (await admin.from("venues").insert({ name: `Event menus A ${stamp}` }).select("id").single()).data!.id;
  venueB = (await admin.from("venues").insert({ name: `Event menus B ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueA });
  eventA = await event(venueA, "A & A");
  eventB = await event(venueB, "B & B");
  guestId = (await admin.from("event_guests").insert({ event_id: eventA, full_name: "Гостин" }).select("id").single()).data!.id;
  standardId = (await admin.from("menu_templates").insert({ venue_id: venueA, name: "Стандарден" }).select("id").single()).data!.id;
  customId = (await admin.from("menu_templates").insert({ venue_id: venueA, name: "Само за настанот", event_id: eventA }).select("id").single()).data!.id;
  dishId = (
    await admin
      .from("menu_items")
      .insert({ venue_id: venueA, tiers: ["special"], course: "main", name: "Јадење", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: 10 })
      .select("id")
      .single()
  ).data!.id;
  staff = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staff.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("events").delete().in("id", [eventA, eventB]);
  await admin.from("venues").delete().in("id", [venueA, venueB]);
});

describe("event-only menus (0119)", () => {
  it("staff cannot create or edit an event-only menu directly", async () => {
    const ins = await staff.from("menu_templates").insert({ venue_id: venueA, name: "Крадено", event_id: eventA });
    expect(ins.error).toBeTruthy();

    const upd = await staff.from("menu_templates").update({ name: "Преименувано" }).eq("id", customId).select("id");
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);
    expect((await admin.from("menu_templates").select("name").eq("id", customId).single()).data!.name).toBe("Само за настанот");

    const del = await staff.from("menu_templates").delete().eq("id", customId).select("id");
    expect(del.data).toEqual([]);
    expect((await admin.from("menu_templates").select("id").eq("id", customId)).data).toHaveLength(1);

    // standard templates behave as before
    const ok = await staff.from("menu_templates").insert({ venue_id: venueA, name: "Нов стандарден" }).select("id").single();
    expect(ok.error).toBeNull();
    const upd2 = await staff.from("menu_templates").update({ name: "Стандарден 2" }).eq("id", standardId).select("id");
    expect(upd2.data).toHaveLength(1);
    await admin.from("menu_templates").delete().eq("id", ok.data!.id);
  });

  it("staff can still read their venue's event-only menu", async () => {
    const { data } = await staff.from("menu_templates").select("id").eq("id", customId);
    expect(data).toHaveLength(1);
  });

  it("staff cannot change dishes of an event-only menu", async () => {
    await expect(setMenuTemplateItems(customId, [dishId], staff)).rejects.toBeTruthy();
    expect((await admin.from("menu_template_items").select("menu_item_id").eq("menu_template_id", customId)).data).toEqual([]);
    await expect(setMenuTemplateItems(standardId, [dishId], staff)).resolves.not.toThrow();
    expect((await admin.from("menu_template_items").select("menu_item_id").eq("menu_template_id", standardId)).data).toHaveLength(1);
  });

  it("event-only menu is deleted with its event", async () => {
    const eid = await event(venueA, "Cascade");
    const tid = (await admin.from("menu_templates").insert({ venue_id: venueA, name: "Каскада", event_id: eid }).select("id").single()).data!.id;
    await admin.from("events").delete().eq("id", eid);
    expect((await admin.from("menu_templates").select("id").eq("id", tid)).data).toEqual([]);
  });
});

describe("event_guest_menu_counts (0119)", () => {
  it("a guest's count must be one of the event's menus", async () => {
    const bad = await admin.from("event_guest_menu_counts").insert({ guest_id: guestId, menu_template_id: customId, count: 2 });
    expect(bad.error?.code).toBe("23514");
    await admin.from("event_menu_templates").insert({ event_id: eventA, menu_template_id: customId });
    const good = await admin.from("event_guest_menu_counts").insert({ guest_id: guestId, menu_template_id: customId, count: 2 });
    expect(good.error).toBeNull();
    const zero = await admin.from("event_guest_menu_counts").update({ count: 0 }).eq("guest_id", guestId);
    expect(zero.error).toBeTruthy();
  });

  it("staff cannot read guest menu counts", async () => {
    const { data, error } = await staff.from("event_guest_menu_counts").select("*");
    expect(error || (data ?? []).length === 0).toBeTruthy();
    expect((await admin.from("event_guest_menu_counts").select("count").eq("guest_id", guestId)).data).toHaveLength(1);
  });

  it("unlinking a menu from an event deletes guests' counts for it", async () => {
    await admin.from("event_menu_templates").delete().eq("event_id", eventA).eq("menu_template_id", customId);
    expect((await admin.from("event_guest_menu_counts").select("count").eq("guest_id", guestId)).data).toEqual([]);
  });
});

describe("event_menu_submissions (0119)", () => {
  it("staff read their own venue's submissions only, and cannot write them", async () => {
    const row = (event_id: string) => ({ event_id, sent_by: "Организатор", counts: { x: 1 }, menu_titles: { x: "Мени" }, total: 1 });
    const a = await admin.from("event_menu_submissions").insert(row(eventA)).select("id").single();
    const b = await admin.from("event_menu_submissions").insert(row(eventB)).select("id").single();
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();

    const { data } = await staff.from("event_menu_submissions").select("id");
    expect((data ?? []).map((r) => r.id)).toEqual([a.data!.id]);

    expect((await staff.from("event_menu_submissions").insert(row(eventA))).error).toBeTruthy();
    const upd = await staff.from("event_menu_submissions").update({ seen_by: "x" }).eq("id", a.data!.id);
    expect(upd.error).toBeTruthy();
    expect((await admin.from("event_menu_submissions").select("seen_by").eq("id", a.data!.id).single()).data!.seen_by).toBeNull();
  });
});

describe("single-menu machinery removed (0122)", () => {
  it("a template from another venue cannot be linked to an event", async () => {
    const foreign = (await admin.from("menu_templates").insert({ venue_id: venueB, name: "Туѓо мени" }).select("id").single()).data!.id;
    const { error } = await admin.from("event_menu_templates").insert({ event_id: eventA, menu_template_id: foreign });
    expect(error?.code).toBe("23514");
    expect((await admin.from("event_menu_templates").select("event_id").eq("menu_template_id", foreign)).data).toEqual([]);
    await admin.from("menu_templates").delete().eq("id", foreign);
  });

  it("another event's custom menu cannot be linked", async () => {
    const other = await event(venueA, "Друг настан");
    const othersCustom = (await admin.from("menu_templates").insert({ venue_id: venueA, name: "Туѓо прилагодено", event_id: other }).select("id").single()).data!.id;
    const { error } = await admin.from("event_menu_templates").insert({ event_id: eventA, menu_template_id: othersCustom });
    expect(error?.code).toBe("23514");
    // its own event and a standard template still link fine
    expect((await admin.from("event_menu_templates").insert({ event_id: other, menu_template_id: othersCustom })).error).toBeNull();
    expect((await admin.from("event_menu_templates").insert({ event_id: other, menu_template_id: standardId })).error).toBeNull();
    await admin.from("events").delete().eq("id", other);
  });

  it("custom menu insert refused at DB level when the event's plan lacks custom_menu", async () => {
    const locked = await event(venueA, "Без прилагодено мени");
    await admin.from("event_feature_overrides").insert({ event_id: locked, feature_key: "custom_menu", enabled: false });
    const { error } = await admin.from("menu_templates").insert({ venue_id: venueA, name: "Забрането", event_id: locked });
    expect(error?.message).toBe("Оваа функција не е вклучена во вашиот пакет.");
    // a standard (venue-wide) template is not gated
    const std = await admin.from("menu_templates").insert({ venue_id: venueA, name: "Слободно" }).select("id").single();
    expect(std.error).toBeNull();
    await admin.from("menu_templates").delete().eq("id", std.data!.id);
    await admin.from("events").delete().eq("id", locked);
  });

  it("dropped objects are gone", async () => {
    const db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await db.connect();
    try {
      const tables = await db.query(
        `select table_name from information_schema.tables
         where table_schema = 'public' and table_name in ('event_custom_menu_items', 'event_menu_item_quantities')`,
      );
      expect(tables.rows).toEqual([]);
      const columns = await db.query(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public'
           and ((table_name = 'events' and column_name = 'menu_template_id')
             or (table_name = 'event_guests' and column_name = 'menu_choice'))`,
      );
      expect(columns.rows).toEqual([]);
      const functions = await db.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('set_event_menu_template', 'set_event_menu_custom', 'replace_menu_item_quantities')`,
      );
      expect(functions.rows).toEqual([]);
      // nothing live still mentions the dropped tables or column
      const bodies = await db.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.prosrc ~ 'event_custom_menu_items|event_menu_item_quantities|menu_choice'`,
      );
      expect(bodies.rows).toEqual([]);
    } finally {
      await db.end();
    }
  });
});
