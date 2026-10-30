import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Task 4: a manager builds one custom menu per event. It is linked to the
// event and never offered as a standard package anywhere else.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const stamp = Date.now();
const EMAIL = `custom-menu-${stamp}@test.local`;
const PASSWORD = "staff-password-123";
const LOCKED = "Оваа функција не е вклучена во вашиот пакет.";

let planId: string;
let venueId: string;
let otherVenueId: string;
let userId: string;
let eventId: string;
let dishA: string;
let dishB: string;
let foreignDish: string;
let managerToken: string;

vi.mock("@/lib/supabase/server", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  return {
    createServerSupabaseClient: async () => {
      const c = create(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      return c;
    },
  };
});

import { PUT } from "@/app/api/venue/events/[eventId]/custom-menu/route";
import { POST as createEventRoute, GET as getNewEventFeatures } from "@/app/api/venue/events/route";
import { saveEventCustomMenu } from "@/lib/venue/event-custom-menu";
import {
  listMenuTemplatesWithItems,
  listMenuTemplates,
} from "@/lib/venue/menus";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

function put(id: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return PUT(
    new NextRequest(`http://localhost/api/venue/events/${id}/custom-menu`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({ eventId: id }),
    },
  );
}

async function dish(venue: string, name: string) {
  return (
    await admin
      .from("menu_items")
      .insert({
        venue_id: venue,
        tiers: ["special"],
        course: "main",
        name,
        allergen_tags: [],
        is_vegetarian: false,
        is_vegan: false,
        price: 10,
      })
      .select("id")
      .single()
  ).data!.id as string;
}

beforeAll(async () => {
  planId = (
    await admin
      .from("plans")
      .insert({ name: `CM ${stamp}` })
      .select("id")
      .single()
  ).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "custom_menu", enabled: true },
    { plan_id: planId, feature_key: "max_active_events", enabled: true },
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 50 },
  ]);
  venueId = (
    await admin
      .from("venues")
      .insert({ name: `CM ${stamp}`, plan_id: planId })
      .select("id")
      .single()
  ).data!.id;
  otherVenueId = (
    await admin
      .from("venues")
      .insert({ name: `CM other ${stamp}`, plan_id: planId })
      .select("id")
      .single()
  ).data!.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user!.id;
  await admin
    .from("venue_staff")
    .insert({ user_id: userId, venue_id: venueId });
  eventId = (
    await admin
      .from("events")
      .insert({
        venue_id: venueId,
        couple_names: "Пар",
        event_date: "2027-06-01",
      })
      .select("id")
      .single()
  ).data!.id;
  dishA = await dish(venueId, "Јадење А");
  dishB = await dish(venueId, "Јадење Б");
  foreignDish = await dish(otherVenueId, "Туѓо јадење");
  const managerId = (
    await admin.rpc("create_venue_manager", {
      p_venue_id: venueId,
      p_name: "Менаџер",
      p_password: "manager-pass-1",
      p_is_owner: false,
    })
  ).data as string;
  managerToken = (
    await createManagerElevation(venueId, managerId, "Менаџер", false)
  ).token;
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
  await admin.from("plans").delete().eq("id", planId);
});

describe("event custom menu", () => {
  it("manager builds a custom menu; it is linked to the event and offered nowhere else", async () => {
    const res = await put(
      eventId,
      { name: "  Мое мени ", item_ids: [dishA] },
      managerToken,
    );
    expect(res.status).toBe(200);
    const { id } = await res.json();

    const tpl = (
      await admin
        .from("menu_templates")
        .select("venue_id, name, event_id")
        .eq("id", id)
        .single()
    ).data!;
    expect(tpl).toEqual({
      venue_id: venueId,
      name: "Мое мени",
      event_id: eventId,
    });
    expect(
      (
        await admin
          .from("event_menu_templates")
          .select("menu_template_id")
          .eq("event_id", eventId)
      ).data,
    ).toEqual([{ menu_template_id: id }]);
    expect(
      (
        await admin
          .from("menu_template_items")
          .select("menu_item_id")
          .eq("menu_template_id", id)
      ).data,
    ).toEqual([{ menu_item_id: dishA }]);

    expect(
      (await listMenuTemplatesWithItems(venueId, admin)).map((t) => t.id),
    ).not.toContain(id);
    expect(
      (await listMenuTemplates(venueId, admin)).map((t) => t.id),
    ).not.toContain(id);
  });

  it("second save updates the same menu", async () => {
    const first = (
      await (
        await put(eventId, { name: "Прво", item_ids: [dishA] }, managerToken)
      ).json()
    ).id;
    const second = (
      await (
        await put(
          eventId,
          { name: "Второ", item_ids: [dishA, dishB] },
          managerToken,
        )
      ).json()
    ).id;
    expect(second).toBe(first);
    const rows = (
      await admin
        .from("menu_templates")
        .select("id, name")
        .eq("event_id", eventId)
    ).data!;
    expect(rows).toEqual([{ id: first, name: "Второ" }]);
    const items = (
      await admin
        .from("menu_template_items")
        .select("menu_item_id")
        .eq("menu_template_id", first)
    ).data!;
    expect(items.map((i) => i.menu_item_id).sort()).toEqual(
      [dishA, dishB].sort(),
    );
    expect(
      (
        await admin
          .from("event_menu_templates")
          .select("menu_template_id")
          .eq("event_id", eventId)
      ).data,
    ).toHaveLength(1);
  });

  it("refused without the custom_menu feature", async () => {
    const noPlan = (
      await admin
        .from("plans")
        .insert({ name: `CM none ${stamp}` })
        .select("id")
        .single()
    ).data!.id;
    await admin.from("plan_features").insert({
      plan_id: noPlan,
      feature_key: "max_active_events",
      enabled: true,
    });
    await admin.from("venues").update({ plan_id: noPlan }).eq("id", venueId);
    try {
      const res = await put(eventId, { name: "Х", item_ids: [] }, managerToken);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe(LOCKED);
    } finally {
      await admin.from("venues").update({ plan_id: planId }).eq("id", venueId);
      await admin.from("plans").delete().eq("id", noPlan);
    }
  });

  it("plain staff 403", async () => {
    expect((await put(eventId, { name: "Х", item_ids: [] })).status).toBe(403);
  });

  it("dishes from another venue are refused", async () => {
    await expect(
      saveEventCustomMenu(admin, venueId, eventId, {
        name: "Х",
        itemIds: [foreignDish],
      }),
    ).rejects.toThrow("Едно или повеќе јадења не припаѓаат на овој локал.");
    const res = await put(
      eventId,
      { name: "Х", item_ids: [foreignDish] },
      managerToken,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("two concurrent first saves end with one custom menu and one link", async () => {
    const ev = (
      await admin
        .from("events")
        .insert({
          venue_id: venueId,
          couple_names: "Race",
          event_date: "2027-07-01",
        })
        .select("id")
        .single()
    ).data!.id;
    const results = await Promise.all([
      saveEventCustomMenu(admin, venueId, ev, { name: "А", itemIds: [dishA] }),
      saveEventCustomMenu(admin, venueId, ev, { name: "Б", itemIds: [dishB] }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await admin.from("menu_templates").select("id").eq("event_id", ev)).data,
    ).toHaveLength(1);
    expect(
      (
        await admin
          .from("event_menu_templates")
          .select("menu_template_id")
          .eq("event_id", ev)
      ).data,
    ).toHaveLength(1);
  });
});

// Task 5: the venue's list of event custom menus, delete (past only) and copy.
import { listEventCustomMenus } from "@/lib/venue/menus";
import { DELETE as DELETE_ROUTE } from "@/app/api/venue/menus/custom/[templateId]/route";
import { POST as COPY_ROUTE } from "@/app/api/venue/menus/custom/[templateId]/copy/route";
import {
  deletePastCustomMenu,
  copyCustomMenuToPackage,
} from "@/lib/venue/event-custom-menu";

function del(id: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return DELETE_ROUTE(
    new NextRequest(`http://localhost/api/venue/menus/custom/${id}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ templateId: id }) },
  );
}
function copy(id: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return COPY_ROUTE(
    new NextRequest(`http://localhost/api/venue/menus/custom/${id}/copy`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ templateId: id }) },
  );
}

async function customMenu(couple: string, date: string, items: string[]) {
  const ev = (
    await admin
      .from("events")
      .insert({ venue_id: venueId, couple_names: couple, event_date: date })
      .select("id")
      .single()
  ).data!.id as string;
  const { id } = await saveEventCustomMenu(admin, venueId, ev, {
    name: `Мени ${couple}`,
    itemIds: items,
  });
  return { ev, id };
}

describe("custom menus section (Task 5)", () => {
  it("lists custom menus with event, dishes and latest sent count", async () => {
    const a = await customMenu("Листа Ана", "2027-03-01", [dishA, dishB]);
    const b = await customMenu("Листа Борис", "2027-02-01", [dishA]);
    expect(
      (
        await admin.from("event_menu_submissions").insert([
          {
            event_id: a.ev,
            sent_by: "Т",
            sent_at: "2026-01-01T10:00:00Z",
            counts: { [a.id]: 5 },
            menu_titles: { [a.id]: "Старо" },
            total: 5,
          },
          {
            event_id: a.ev,
            sent_by: "Т",
            sent_at: "2026-02-01T10:00:00Z",
            counts: { [a.id]: 9 },
            menu_titles: { [a.id]: "Ново" },
            total: 9,
          },
        ])
      ).error,
    ).toBeNull();
    const list = await listEventCustomMenus(venueId, admin);
    const ids = list.map((m) => m.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id)); // by event date
    const la = list.find((m) => m.id === a.id)!;
    expect(la.event).toEqual({
      id: a.ev,
      couple_names: "Листа Ана",
      event_date: "2027-03-01",
    });
    expect(la.items.map((i) => i.id).sort()).toEqual([dishA, dishB].sort());
    expect(la.latestCount).toBe(9);
    expect(list.find((m) => m.id === b.id)!.latestCount).toBeNull();

    // Plain staff session (no manager elevation) reads the same through RLS.
    const staff = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    expect(
      (
        await staff.auth.signInWithPassword({
          email: EMAIL,
          password: PASSWORD,
        })
      ).error,
    ).toBeNull();
    const staffList = await listEventCustomMenus(venueId, staff);
    const sa = staffList.find((m) => m.id === a.id)!;
    expect(sa.event).toEqual({
      id: a.ev,
      couple_names: "Листа Ана",
      event_date: "2027-03-01",
    });
    expect(sa.items).toHaveLength(2);
    expect(sa.latestCount).toBe(9);
    expect(staffList.find((m) => m.id === b.id)!.latestCount).toBeNull();
  });

  it("deleting is refused for an upcoming event and allowed for a past one", async () => {
    const up = await customMenu("Идна", "2099-01-01", [dishA]);
    const past = await customMenu("Мината", "2020-01-01", [dishA]);
    await expect(deletePastCustomMenu(admin, venueId, up.id)).rejects.toThrow(
      "Може да се избрише само сопствено мени од поминат настан.",
    );
    const refused = await del(up.id, managerToken);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe(
      "Може да се избрише само сопствено мени од поминат настан.",
    );
    expect(
      (await admin.from("menu_templates").select("id").eq("id", up.id)).data,
    ).toHaveLength(1);

    expect((await del(past.id, managerToken)).status).toBe(200);
    expect(
      (await admin.from("menu_templates").select("id").eq("id", past.id)).data,
    ).toHaveLength(0);
    expect(
      (
        await admin
          .from("event_menu_templates")
          .select("menu_template_id")
          .eq("event_id", past.ev)
      ).data,
    ).toHaveLength(0);
  });

  it("delete 404s for a standard package or another venue's menu", async () => {
    const std = (
      await admin
        .from("menu_templates")
        .insert({ venue_id: venueId, name: "Стандарден" })
        .select("id")
        .single()
    ).data!.id;
    expect((await del(std, managerToken)).status).toBe(404);
    const other = (
      await admin
        .from("menu_templates")
        .insert({ venue_id: otherVenueId, name: "Туѓ" })
        .select("id")
        .single()
    ).data!.id;
    expect((await del(other, managerToken)).status).toBe(404);
  });

  it("deleting keeps the event's submissions and their stored title", async () => {
    const past = await customMenu("Поднесена", "2020-02-01", [dishA]);
    expect(
      (
        await admin.from("event_menu_submissions").insert({
          event_id: past.ev,
          sent_by: "Т",
          counts: { [past.id]: 4 },
          menu_titles: { [past.id]: "Зачувано име" },
          total: 4,
        })
      ).error,
    ).toBeNull();
    await deletePastCustomMenu(admin, venueId, past.id);
    const rows = (
      await admin
        .from("event_menu_submissions")
        .select("counts, menu_titles")
        .eq("event_id", past.ev)
    ).data!;
    expect(rows).toHaveLength(1);
    expect(rows[0].menu_titles).toEqual({ [past.id]: "Зачувано име" });
  });

  it("copy creates a standard package with the same dishes", async () => {
    const up = await customMenu("Копија", "2099-05-05", [dishA, dishB]);
    const res = await copy(up.id, managerToken);
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const tpl = (
      await admin
        .from("menu_templates")
        .select("venue_id, name, event_id")
        .eq("id", id)
        .single()
    ).data!;
    expect(tpl).toEqual({
      venue_id: venueId,
      name: "Мени Копија (05.05.2099)",
      event_id: null,
    });
    const items = (
      await admin
        .from("menu_template_items")
        .select("menu_item_id")
        .eq("menu_template_id", id)
    ).data!;
    expect(items.map((i) => i.menu_item_id).sort()).toEqual(
      [dishA, dishB].sort(),
    );
    expect(
      (
        await admin
          .from("event_menu_templates")
          .select("menu_template_id")
          .eq("menu_template_id", id)
      ).data,
    ).toHaveLength(0);
    expect(
      (await listMenuTemplates(venueId, admin)).map((t) => t.id),
    ).toContain(id);
    // original untouched
    expect(
      (
        await admin
          .from("menu_templates")
          .select("event_id")
          .eq("id", up.id)
          .single()
      ).data!.event_id,
    ).toBe(up.ev);
    await expect(copyCustomMenuToPackage(admin, venueId, id)).rejects.toThrow();
  });

  it("staff 403 on delete/copy", async () => {
    const past = await customMenu("Без права", "2020-03-01", [dishA]);
    expect((await del(past.id)).status).toBe(403);
    expect((await copy(past.id)).status).toBe(403);
    expect(
      (await admin.from("menu_templates").select("id").eq("id", past.id)).data,
    ).toHaveLength(1);
  });
});

// Final review fixes.
import { GET } from "@/app/api/venue/events/[eventId]/custom-menu/route";
import { updateEvent } from "@/lib/venue/events";

function getEnabled(id: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return GET(
    new NextRequest(`http://localhost/api/venue/events/${id}/custom-menu`, { headers }),
    { params: Promise.resolve({ eventId: id }) },
  );
}

async function newEvent(couple: string, date: string) {
  const { data, error } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: couple, event_date: date })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("final review fixes", () => {
  it("removing the custom menu from an upcoming event deletes the template, its link and guests' counts", async () => {
    const ev = await newEvent("Отстрани", "2099-04-01");
    const pkgRow = await admin
      .from("menu_templates")
      .insert({ venue_id: venueId, name: "Пакет што останува" })
      .select("id")
      .single();
    if (pkgRow.error) throw pkgRow.error;
    const pkg = pkgRow.data.id as string;
    const { id: custom } = await saveEventCustomMenu(admin, venueId, ev, {
      name: "Сопствено",
      itemIds: [dishA],
    });
    expect(
      (await admin.from("event_menu_templates").insert({ event_id: ev, menu_template_id: pkg })).error,
    ).toBeNull();
    const guestRow = await admin
      .from("event_guests")
      .insert({ event_id: ev, full_name: "Гостин" })
      .select("id")
      .single();
    if (guestRow.error) throw guestRow.error;
    const guest = guestRow.data.id as string;
    expect(
      (
        await admin.from("event_guest_menu_counts").insert([
          { guest_id: guest, menu_template_id: custom, count: 2 },
          { guest_id: guest, menu_template_id: pkg, count: 1 },
        ])
      ).error,
    ).toBeNull();

    await updateEvent(
      ev,
      venueId,
      {
        couple_names: "Отстрани",
        event_date: "2099-04-01",
        start_time: null,
        end_time: null,
        status: "preparation",
        event_type: "other",
        guest_count_estimate: null,
        room_ids: [],
        added_menu_ids: [],
        removed_menu_ids: [custom],
      },
      admin,
    );

    expect((await admin.from("menu_templates").select("id").eq("id", custom)).data).toHaveLength(0);
    expect(
      (await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", ev)).data,
    ).toEqual([{ menu_template_id: pkg }]);
    expect(
      (await admin.from("event_guest_menu_counts").select("menu_template_id, count").eq("guest_id", guest)).data,
    ).toEqual([{ menu_template_id: pkg, count: 1 }]);
    // The standard package itself is untouched.
    expect((await admin.from("menu_templates").select("id").eq("id", pkg)).data).toHaveLength(1);
  });

  it("saving the custom menu again restores a missing event link (still one template)", async () => {
    const ev = await newEvent("Врска", "2099-04-02");
    const { id } = await saveEventCustomMenu(admin, venueId, ev, { name: "М", itemIds: [dishA] });
    await admin.from("event_menu_templates").delete().eq("event_id", ev).eq("menu_template_id", id);
    const again = await saveEventCustomMenu(admin, venueId, ev, { name: "М", itemIds: [dishA, dishB] });
    expect(again.id).toBe(id);
    expect((await admin.from("menu_templates").select("id").eq("event_id", ev)).data).toHaveLength(1);
    expect(
      (await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", ev)).data,
    ).toEqual([{ menu_template_id: id }]);
  });

  it("PUT refuses a past event (409) and an empty dish list (400)", async () => {
    const past = await newEvent("Мината PUT", "2020-05-01");
    const refused = await put(past, { name: "Х", item_ids: [dishA] }, managerToken);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe("Настанот е во минатото и повеќе не може да се уредува.");
    expect((await admin.from("menu_templates").select("id").eq("event_id", past)).data).toHaveLength(0);

    const ev = await newEvent("Празно", "2099-04-03");
    const empty = await put(ev, { name: "Х", item_ids: [] }, managerToken);
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toBe("Изберете барем едно јадење.");
    expect((await admin.from("menu_templates").select("id").eq("event_id", ev)).data).toHaveLength(0);
  });

  it("GET says whether the custom menu is enabled; plain staff 403", async () => {
    const ev = await newEvent("Вклучено", "2099-04-04");
    const on = await getEnabled(ev, managerToken);
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ enabled: true });

    expect((await getEnabled(ev)).status).toBe(403);

    const noPlan = (
      await admin.from("plans").insert({ name: `CM get none ${stamp}` }).select("id").single()
    ).data!.id;
    await admin.from("plan_features").insert({ plan_id: noPlan, feature_key: "max_active_events", enabled: true });
    await admin.from("venues").update({ plan_id: noPlan }).eq("id", venueId);
    try {
      const off = await getEnabled(ev, managerToken);
      expect(off.status).toBe(200);
      expect(await off.json()).toEqual({ enabled: false });
    } finally {
      await admin.from("venues").update({ plan_id: planId }).eq("id", venueId);
      await admin.from("plans").delete().eq("id", noPlan);
    }
  });
});

describe("custom menu built in the new-event form", () => {
  function create(body: Record<string, unknown>, token?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers[MANAGER_TOKEN_HEADER] = token;
    return createEventRoute(
      new NextRequest("http://localhost/api/venue/events", { method: "POST", headers, body: JSON.stringify(body) }),
      { params: Promise.resolve({}) },
    );
  }
  function eventBody(name: string, customMenu: unknown) {
    return {
      couple_names: name,
      event_date: "2099-05-01",
      room_ids: [],
      menu_template_ids: [],
      contacts: { contact_email: "par@example.com", contact_phone: "070 123 456" },
      credentials: { username: `nov-${stamp}-${name.length}-${Math.random().toString(36).slice(2, 8)}`, password: "a-strong-password" },
      custom_menu: customMenu,
    };
  }
  async function eventsNamed(name: string) {
    return (await admin.from("events").select("id").eq("venue_id", venueId).eq("couple_names", name)).data ?? [];
  }

  it("creates the event together with its custom menu, linked and with its dishes", async () => {
    const res = await create(eventBody("Нов со мени", { name: "Мени на парот", item_ids: [dishA, dishB] }), managerToken);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    const menu = (await admin.from("menu_templates").select("id, name").eq("event_id", id).single()).data!;
    expect(menu.name).toBe("Мени на парот");
    expect((await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", id)).data).toEqual([
      { menu_template_id: menu.id },
    ]);
    const items = (await admin.from("menu_template_items").select("menu_item_id").eq("menu_template_id", menu.id)).data!;
    expect(items.map((i) => i.menu_item_id).sort()).toEqual([dishA, dishB].sort());
  });

  it("refuses without the feature, with no dishes, or with another venue's dish — and creates nothing", async () => {
    expect((await create(eventBody("Празно мени", { name: "Х", item_ids: [] }), managerToken)).status).toBe(400);
    expect(await eventsNamed("Празно мени")).toHaveLength(0);

    const foreign = await create(eventBody("Туѓо мени", { name: "Х", item_ids: [foreignDish] }), managerToken);
    expect(foreign.status).toBe(400);
    expect((await foreign.json()).error).toBe("Едно или повеќе јадења не припаѓаат на овој локал.");
    expect(await eventsNamed("Туѓо мени")).toHaveLength(0);

    const noPlan = (await admin.from("plans").insert({ name: `CM new none ${stamp}` }).select("id").single()).data!.id;
    await admin.from("plan_features").insert({ plan_id: noPlan, feature_key: "max_active_events", enabled: true });
    await admin.from("venues").update({ plan_id: noPlan }).eq("id", venueId);
    try {
      const locked = await create(eventBody("Заклучено мени", { name: "Х", item_ids: [dishA] }), managerToken);
      expect(locked.status).toBe(403);
      expect((await locked.json()).error).toBe(LOCKED);
      expect(await eventsNamed("Заклучено мени")).toHaveLength(0);
      const off = await getNewEventFeatures(
        new NextRequest("http://localhost/api/venue/events", { headers: { [MANAGER_TOKEN_HEADER]: managerToken } }),
        { params: Promise.resolve({}) },
      );
      expect(await off.json()).toEqual({ customMenuEnabled: false });
    } finally {
      await admin.from("venues").update({ plan_id: planId }).eq("id", venueId);
      await admin.from("plans").delete().eq("id", noPlan);
    }
  });

  it("an event without a custom menu is created as before; GET is manager-only", async () => {
    const res = await create(eventBody("Без сопствено", undefined), managerToken);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect((await admin.from("menu_templates").select("id").eq("event_id", id)).data).toHaveLength(0);

    const get = (token?: string) =>
      getNewEventFeatures(
        new NextRequest("http://localhost/api/venue/events", { headers: token ? { [MANAGER_TOKEN_HEADER]: token } : {} }),
        { params: Promise.resolve({}) },
      );
    expect(await (await get(managerToken)).json()).toEqual({ customMenuEnabled: true });
    expect((await get()).status).toBe(403);
  });
});
