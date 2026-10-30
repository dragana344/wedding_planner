import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { setMenuTemplateItems, listMenuTemplateItems, countEventsUsingTemplate, deleteMenuTemplate } from "@/lib/venue/menus";
import { todayIn } from "@/lib/date";

// 0118: replacing a package's dishes is one transaction — a failure keeps the
// package's previous dishes instead of leaving it empty — and the caller's
// RLS still applies (staff can't put another venue's dish in their package).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `menu-atomic-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

let venueId: string;
let otherVenueId: string;
let userId: string;
let templateId: string;
let soupId: string;
let chickenId: string;
let foreignDishId: string;
let staff: SupabaseClient;

async function dish(venue: string, name: string): Promise<string> {
  const { data, error } = await admin
    .from("menu_items")
    .insert({ venue_id: venue, tiers: ["special"], course: "main", name, allergen_tags: [], is_vegetarian: false, is_vegan: false, price: 10 })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Menu atomic ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Menu atomic other ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  templateId = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "Пакет" }).select("id").single()).data!.id;
  soupId = await dish(venueId, "Супа");
  chickenId = await dish(venueId, "Пилешко");
  foreignDishId = await dish(otherVenueId, "Туѓо јадење");
  staff = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staff.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

const ids = async () => (await listMenuTemplateItems(templateId, admin)).map((i) => i.id).sort();

describe("replace_menu_template_items (0118)", () => {
  it("replaces a package's dishes as staff", async () => {
    await setMenuTemplateItems(templateId, [soupId, chickenId], staff);
    expect(await ids()).toEqual([soupId, chickenId].sort());
    await setMenuTemplateItems(templateId, [chickenId], staff);
    expect(await ids()).toEqual([chickenId]);
  });

  it("keeps the previous dishes when the new set can't be saved (a dish deleted meanwhile)", async () => {
    await setMenuTemplateItems(templateId, [soupId, chickenId], staff);
    await expect(setMenuTemplateItems(templateId, [soupId, randomUUID()], staff)).rejects.toBeTruthy();
    expect(await ids()).toEqual([soupId, chickenId].sort());
  });

  it("refuses another venue's dish and leaves the package as it was", async () => {
    await expect(setMenuTemplateItems(templateId, [soupId, foreignDishId], staff)).rejects.toBeTruthy();
    expect(await ids()).toEqual([soupId, chickenId].sort());
  });

  it("tolerates a dish listed twice", async () => {
    await setMenuTemplateItems(templateId, [soupId, soupId], staff);
    expect(await ids()).toEqual([soupId]);
  });

  it("is not callable without signing in", async () => {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await expect(setMenuTemplateItems(templateId, [], anon)).rejects.toBeTruthy();
    expect(await ids()).toEqual([soupId]);
  });
});

describe("countEventsUsingTemplate (package delete warning)", () => {
  it("counts events that have the package, once each, split into upcoming and past, as staff", async () => {
    expect(await countEventsUsingTemplate(templateId, staff)).toEqual({ upcoming: 0, past: 0 });
    const main = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Главно", event_date: "2099-08-01" }).select("id").single()).data!.id;
    const extra = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Дополнително", event_date: "2099-08-02" }).select("id").single()).data!.id;
    const old = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Минато", event_date: "2020-08-02" }).select("id").single()).data!.id;
    const today = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Денес", event_date: todayIn() }).select("id").single()).data!.id;
    await admin.from("event_menu_templates").insert([
      { event_id: main, menu_template_id: templateId },
      { event_id: extra, menu_template_id: templateId },
      { event_id: old, menu_template_id: templateId },
      { event_id: today, menu_template_id: templateId },
    ]);
    expect(await countEventsUsingTemplate(templateId, staff)).toEqual({ upcoming: 3, past: 1 });
  });

  it("deleteMenuTemplate refuses a package on an upcoming event and allows one used only by past events", async () => {
    const pkg = (await admin.from("menu_templates").insert({ venue_id: venueId, name: "За бришење" }).select("id").single()).data!.id;
    const up = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Идно", event_date: "2099-09-01" }).select("id").single()).data!.id;
    const old = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Старо", event_date: "2020-09-01" }).select("id").single()).data!.id;
    await admin.from("event_menu_templates").insert([
      { event_id: up, menu_template_id: pkg },
      { event_id: old, menu_template_id: pkg },
    ]);
    await expect(deleteMenuTemplate(pkg, staff)).rejects.toThrow("Пакетот се користи во 1 претстоен настан — прво отстранете го од тој настан.");
    expect((await admin.from("menu_templates").select("id").eq("id", pkg)).data).toHaveLength(1);
    await admin.from("event_menu_templates").delete().eq("event_id", up);
    await deleteMenuTemplate(pkg, staff);
    expect((await admin.from("menu_templates").select("id").eq("id", pkg)).data).toHaveLength(0);
    expect((await admin.from("event_menu_templates").select("event_id").eq("event_id", old)).data).toHaveLength(0);
  });
});
