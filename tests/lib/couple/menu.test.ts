// tests/lib/couple/menu.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getVenueMenuOptions, setEventMenuSelection } from "@/lib/couple/menu";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/menu", () => {
  it("lists the venue's templates with items, and lets a couple pick one", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Couple Menu Venue" }).select().single();
    const { data: template } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Classic" }).select().single();
    const { data: item } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Steak" })
      .select()
      .single();
    await admin.from("menu_template_items").insert({ menu_template_id: template!.id, menu_item_id: item!.id });
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Menu & Test", event_date: "2027-01-05" })
      .select()
      .single();

    const options = await getVenueMenuOptions(event!.id);
    expect(options.templates).toHaveLength(1);
    expect(options.templates[0].items).toHaveLength(1);
    expect(options.specialItems.some((i) => i.id === item!.id)).toBe(true);
    expect(options.currentSelection).toEqual({ mode: "none" });

    await setEventMenuSelection(event!.id, { mode: "template", menuTemplateId: template!.id });
    const afterPick = await getVenueMenuOptions(event!.id);
    expect(afterPick.currentSelection).toEqual({ mode: "template", menuTemplateId: template!.id });

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("builds a custom menu and clears any prior template selection", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Custom Menu Venue" }).select().single();
    const { data: template } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "T" }).select().single();
    const { data: itemA } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "starter", name: "Soup" })
      .select()
      .single();
    const { data: itemB } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Fish" })
      .select()
      .single();
    await admin.from("menu_template_items").insert([
      { menu_template_id: template!.id, menu_item_id: itemA!.id },
      { menu_template_id: template!.id, menu_item_id: itemB!.id },
    ]);
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Custom & Builder", event_date: "2027-01-10", menu_template_id: template!.id })
      .select()
      .single();

    await setEventMenuSelection(event!.id, { mode: "custom", menuItemIds: [itemA!.id, itemB!.id] });

    const options = await getVenueMenuOptions(event!.id);
    expect(options.currentSelection.mode).toBe("custom");
    expect(options.currentSelection.mode === "custom" && options.currentSelection.menuItemIds.sort()).toEqual(
      [itemA!.id, itemB!.id].sort()
    );

    const { data: eventRow } = await admin.from("events").select("menu_template_id").eq("id", event!.id).single();
    expect(eventRow!.menu_template_id).toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("rejects a template selection whose template belongs to a different venue", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Owner Venue" }).select().single();
    const { data: otherVenue } = await admin.from("venues").insert({ name: "Other Venue" }).select().single();
    const { data: otherTemplate } = await admin
      .from("menu_templates")
      .insert({ venue_id: otherVenue!.id, name: "Foreign Template" })
      .select()
      .single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Cross & Venue", event_date: "2027-02-01" })
      .select()
      .single();

    await expect(
      setEventMenuSelection(event!.id, { mode: "template", menuTemplateId: otherTemplate!.id })
    ).rejects.toThrow("Менито не припаѓа на овој локал.");

    const { data: eventRow } = await admin.from("events").select("menu_template_id").eq("id", event!.id).single();
    expect(eventRow!.menu_template_id).toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
    await admin.from("venues").delete().eq("id", otherVenue!.id);
  });

  it("rejects a custom menu selection containing an item from a different venue's pool", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Owner Venue 2" }).select().single();
    const { data: ownItem } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "starter", name: "Salad" })
      .select()
      .single();

    const { data: otherVenue } = await admin.from("venues").insert({ name: "Other Venue 2" }).select().single();
    const { data: foreignItem } = await admin
      .from("menu_items")
      .insert({ venue_id: otherVenue!.id, tiers: ["special"], course: "main", name: "Foreign Dish" })
      .select()
      .single();

    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Cross & Custom", event_date: "2027-02-05" })
      .select()
      .single();

    await expect(
      setEventMenuSelection(event!.id, { mode: "custom", menuItemIds: [ownItem!.id, foreignItem!.id] })
    ).rejects.toThrow("One or more menu items do not belong to this venue.");

    const { data: rows } = await admin.from("event_custom_menu_items").select("id").eq("event_id", event!.id);
    expect(rows ?? []).toHaveLength(0);

    await admin.from("venues").delete().eq("id", venue!.id);
    await admin.from("venues").delete().eq("id", otherVenue!.id);
  });
});

import { getMenuItemQuantities, setMenuItemQuantities } from "@/lib/couple/menu";

describe("lib/couple/menu: quantity split", () => {
  it("sets, gets, and replaces quantities, allowing one blank item per course", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Quantity Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "Quantity Couple", event_date: "2027-05-01" }).select().single();
    const { data: chicken } = await admin.from("menu_items").insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Печено пиле" }).select().single();
    const { data: veg } = await admin.from("menu_items").insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Вегетаријанско" }).select().single();

    await setMenuItemQuantities(event!.id, [
      { menu_item_id: chicken!.id, guest_count: null },
      { menu_item_id: veg!.id, guest_count: 5 },
    ]);

    const quantities = await getMenuItemQuantities(event!.id);
    expect(quantities).toHaveLength(2);
    expect(quantities.find((q) => q.menu_item_id === veg!.id)?.guest_count).toBe(5);

    // replacing wholesale drops the old rows
    await setMenuItemQuantities(event!.id, [{ menu_item_id: chicken!.id, guest_count: 20 }]);
    expect(await getMenuItemQuantities(event!.id)).toEqual([{ menu_item_id: chicken!.id, guest_count: 20 }]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("clears quantity rows for items dropped from a new custom selection", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Prune Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "Prune Couple", event_date: "2027-05-03" }).select().single();
    const { data: itemA } = await admin.from("menu_items").insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Kept Dish" }).select().single();
    const { data: itemB } = await admin.from("menu_items").insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Dropped Dish" }).select().single();

    await setEventMenuSelection(event!.id, { mode: "custom", menuItemIds: [itemA!.id, itemB!.id] });
    await setMenuItemQuantities(event!.id, [
      { menu_item_id: itemA!.id, guest_count: 10 },
      { menu_item_id: itemB!.id, guest_count: 5 },
    ]);

    await setEventMenuSelection(event!.id, { mode: "custom", menuItemIds: [itemA!.id] });

    const quantities = await getMenuItemQuantities(event!.id);
    expect(quantities.find((q) => q.menu_item_id === itemB!.id)).toBeUndefined();
    expect(quantities.find((q) => q.menu_item_id === itemA!.id)?.guest_count).toBe(10);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("rejects more than one blank item within the same course", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Quantity Reject Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "C", event_date: "2027-05-02" }).select().single();
    const { data: main1 } = await admin.from("menu_items").insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "A" }).select().single();
    const { data: main2 } = await admin.from("menu_items").insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "B" }).select().single();

    await expect(
      setMenuItemQuantities(event!.id, [
        { menu_item_id: main1!.id, guest_count: null },
        { menu_item_id: main2!.id, guest_count: null },
      ])
    ).rejects.toThrow("Only one item per course");

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
