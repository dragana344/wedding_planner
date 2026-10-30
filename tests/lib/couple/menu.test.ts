// tests/lib/couple/menu.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getEventMenus } from "@/lib/couple/menu";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/menu: getEventMenus", () => {
  it("getEventMenus returns the event's menus with sorted dishes, custom included", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Couple Menu Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Menu & Test", event_date: "2027-01-05" })
      .select()
      .single();
    const { data: otherEvent } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Other", event_date: "2027-01-06" })
      .select()
      .single();

    const { data: classic } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Класично" }).select().single();
    const { data: custom } = await admin
      .from("menu_templates")
      .insert({ venue_id: venue!.id, name: "Сопствено мени", event_id: event!.id })
      .select()
      .single();
    const { data: unlinked } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Не е врзано" }).select().single();

    const mk = async (course: string, name: string) =>
      (await admin.from("menu_items").insert({ venue_id: venue!.id, tiers: ["special"], course, name }).select().single()).data!;
    const dessert = await mk("dessert", "Торта");
    const main = await mk("main", "Говедско");
    const starter = await mk("starter", "Супа");
    const lone = await mk("main", "Риба");

    await admin.from("menu_template_items").insert([
      { menu_template_id: classic!.id, menu_item_id: dessert.id },
      { menu_template_id: classic!.id, menu_item_id: main.id },
      { menu_template_id: classic!.id, menu_item_id: starter.id },
      { menu_template_id: custom!.id, menu_item_id: lone.id },
      { menu_template_id: unlinked!.id, menu_item_id: lone.id },
    ]);
    await admin.from("event_menu_templates").insert([
      { event_id: event!.id, menu_template_id: classic!.id },
      { event_id: event!.id, menu_template_id: custom!.id },
      { event_id: otherEvent!.id, menu_template_id: classic!.id },
    ]);

    const menus = await getEventMenus(event!.id);
    expect(menus).toEqual([
      {
        id: classic!.id,
        name: "Класично",
        isCustom: false,
        dishes: [
          { course: "starter", name: "Супа" },
          { course: "main", name: "Говедско" },
          { course: "dessert", name: "Торта" },
        ],
      },
      { id: custom!.id, name: "Сопствено мени", isCustom: true, dishes: [{ course: "main", name: "Риба" }] },
    ]);

    expect(await getEventMenus(otherEvent!.id)).toHaveLength(1);
    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("returns an empty list for an event with no menus", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "No Menu Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "No Menu", event_date: "2027-01-07" })
      .select()
      .single();
    expect(await getEventMenus(event!.id)).toEqual([]);
    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
