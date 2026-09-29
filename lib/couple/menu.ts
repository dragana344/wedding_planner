// lib/couple/menu.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { assertUuids } from "@/lib/api/schemas";
import type { MenuTemplate, MenuItem } from "@/lib/venue/menus";

const INVALID_MENU_ID_ERROR = "Invalid menu item id.";

export type MenuSelection =
  | { mode: "template"; menuTemplateId: string }
  | { mode: "custom"; menuItemIds: string[] }
  | { mode: "none" };

export interface VenueMenuOptions {
  templates: (MenuTemplate & { items: MenuItem[] })[];
  /** The venue's special-event item pool — what the custom builder picks
   * from. Everyday-menu items are deliberately excluded here: an organizer
   * choosing a menu for their event only ever needs to look at the
   * special-event pool, never the day-to-day restaurant menu. */
  specialItems: MenuItem[];
  currentSelection: MenuSelection;
}

export async function getVenueMenuOptions(eventId: string): Promise<VenueMenuOptions> {
  const client = createServiceRoleClient();

  const { data: event } = await client.from("events").select("venue_id, menu_template_id").eq("id", eventId).single();
  if (!event) throw new Error("Event not found.");

  const { data: templates } = await client
    .from("menu_templates")
    .select(
      "id, venue_id, name, description, menu_template_items(menu_items(id, venue_id, tiers, course, name, allergen_tags, is_vegetarian, is_vegan, price, photo_path))"
    )
    .eq("venue_id", event.venue_id)
    .order("name");

  const mappedTemplates = (templates ?? []).map((t) => ({
    id: t.id,
    venue_id: t.venue_id,
    name: t.name,
    description: t.description,
    items: ((t.menu_template_items ?? []) as unknown as { menu_items: MenuItem | null }[])
      .map((link) => link.menu_items)
      .filter((item): item is MenuItem => item !== null),
  }));

  const { data: specialItems } = await client
    .from("menu_items")
    .select("id, venue_id, tiers, course, name, allergen_tags, is_vegetarian, is_vegan, price, photo_path")
    .eq("venue_id", event.venue_id)
    .contains("tiers", ["special"])
    .order("course")
    .order("name");

  let currentSelection: MenuSelection = { mode: "none" };
  if (event.menu_template_id) {
    currentSelection = { mode: "template", menuTemplateId: event.menu_template_id };
  } else {
    const { data: customItems } = await client.from("event_custom_menu_items").select("menu_item_id").eq("event_id", eventId);
    if (customItems && customItems.length > 0) {
      currentSelection = { mode: "custom", menuItemIds: customItems.map((i) => i.menu_item_id) };
    }
  }

  return { templates: mappedTemplates, specialItems: (specialItems ?? []) as MenuItem[], currentSelection };
}

export async function setEventMenuSelection(
  eventId: string,
  selection: { mode: "template"; menuTemplateId: string } | { mode: "custom"; menuItemIds: string[] }
): Promise<void> {
  // Defence in depth behind the route schema: only UUIDs ever reach a query
  // (these ids were once interpolated into a raw PostgREST filter).
  if (selection.mode === "template") assertUuids([selection.menuTemplateId], INVALID_MENU_ID_ERROR);
  else assertUuids(selection.menuItemIds, INVALID_MENU_ID_ERROR);

  const client = createServiceRoleClient();

  const { data: event } = await client.from("events").select("venue_id").eq("id", eventId).single();
  if (!event) throw new Error("Event not found.");

  if (selection.mode === "template") {
    const { data: template } = await client
      .from("menu_templates")
      .select("id")
      .eq("id", selection.menuTemplateId)
      .eq("venue_id", event.venue_id)
      .maybeSingle();
    if (!template) throw new Error("Menu template does not belong to this venue.");

    // REL-005: set template, clear custom picks, prune quantities, atomically.
    const { error } = await client.rpc("set_event_menu_template", {
      p_event_id: eventId,
      p_template_id: selection.menuTemplateId,
    });
    if (error) throw error;
    return;
  }

  if (selection.menuItemIds.length > 0) {
    const { data: validItems } = await client
      .from("menu_items")
      .select("id")
      .in("id", selection.menuItemIds)
      .eq("venue_id", event.venue_id);
    if (!validItems || validItems.length !== selection.menuItemIds.length) {
      throw new Error("One or more menu items do not belong to this venue.");
    }
  }

  // REL-005: clear template, replace picks, prune quantities, atomically.
  const { error } = await client.rpc("set_event_menu_custom", {
    p_event_id: eventId,
    p_menu_item_ids: selection.menuItemIds,
  });
  if (error) throw error;
}

export interface MenuItemQuantity {
  menu_item_id: string;
  guest_count: number | null;
}

export async function getMenuItemQuantities(eventId: string): Promise<MenuItemQuantity[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_menu_item_quantities")
    .select("menu_item_id, guest_count")
    .eq("event_id", eventId);
  if (error) throw error;
  return data;
}

export async function setMenuItemQuantities(eventId: string, quantities: MenuItemQuantity[]): Promise<void> {
  assertUuids(
    quantities.map((q) => q.menu_item_id),
    INVALID_MENU_ID_ERROR,
  );
  const client = createServiceRoleClient();

  if (quantities.length > 0) {
    const { data: items, error: itemsError } = await client
      .from("menu_items")
      .select("id, course")
      .in("id", quantities.map((q) => q.menu_item_id));
    if (itemsError) throw itemsError;
    const courseById = new Map(items.map((i) => [i.id, i.course]));
    const blanksByCourse = new Map<string, number>();
    for (const q of quantities) {
      if (q.guest_count !== null) continue;
      const course = courseById.get(q.menu_item_id) ?? "unknown";
      blanksByCourse.set(course, (blanksByCourse.get(course) ?? 0) + 1);
    }
    for (const count of Array.from(blanksByCourse.values())) {
      if (count > 1) throw new Error("Only one item per course may be left without a guest count.");
    }
  }

  // REL-005: delete + insert in one transaction (migration 0041).
  const { error } = await client.rpc("replace_menu_item_quantities", {
    p_event_id: eventId,
    p_quantities: quantities.map((q) => ({ menu_item_id: q.menu_item_id, guest_count: q.guest_count })),
  });
  if (error) throw error;
}
