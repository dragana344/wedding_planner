import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { todayIn } from "@/lib/date";

export interface MenuTemplate {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
}

/** Every item is an event dish ("Мени" in the UI) — this app has no
 * day-to-day restaurant menu to distinguish it from. `tiers` stays an array
 * of exactly `["special"]` for now rather than a plain boolean/enum, so a
 * future second tag doesn't need another schema migration. */
export type MenuItemTier = "special";

export interface MenuItem {
  id: string;
  venue_id: string;
  tiers: MenuItemTier[];
  course: "starter" | "main" | "dessert" | "other";
  name: string;
  allergen_tags: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  price: number | null;
  photo_path: string | null;
}

export interface MenuItemInput {
  venue_id: string;
  tiers: MenuItemTier[];
  course: MenuItem["course"];
  name: string;
  allergen_tags: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  price: number | null;
}

export interface MenuItemUpdateInput {
  tiers: MenuItemTier[];
  course: MenuItem["course"];
  name: string;
  allergen_tags: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  price: number | null;
  photo_path?: string | null;
}

const MENU_ITEM_COLUMNS =
  "id, venue_id, tiers, course, name, allergen_tags, is_vegetarian, is_vegan, price, photo_path";

const MENU_ITEM_PHOTOS_BUCKET = "menu-item-photos";
const PHOTO_CACHE_SECONDS = "31536000";

export function getMenuItemPhotoUrl(photoPath: string | null): string | null {
  if (!photoPath) return null;
  const { data } = resolveSupabaseClient()
    .storage.from(MENU_ITEM_PHOTOS_BUCKET)
    .getPublicUrl(photoPath);
  return data.publicUrl;
}

export async function uploadMenuItemPhoto(
  venueId: string,
  itemId: string,
  file: File,
): Promise<string> {
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${venueId}/${itemId}-${Date.now()}.${extension}`;
  const { error } = await resolveSupabaseClient()
    .storage.from(MENU_ITEM_PHOTOS_BUCKET)
    // Each upload gets a new path, so the file never changes: cache it for a year (PERF-001).
    .upload(path, file, { upsert: true, cacheControl: PHOTO_CACHE_SECONDS });
  if (error) throw error;
  return path;
}

export async function listMenuTemplates(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<MenuTemplate[]> {
  const { data, error } = await client
    .from("menu_templates")
    .select("id, venue_id, name, description")
    .eq("venue_id", venueId)
    .is("event_id", null)
    .order("name");
  if (error) throw error;
  return data;
}

/** Every template plus its composed items, in one call — used wherever a
 * menu's full contents need to be displayed (not just its name). */
export async function listMenuTemplatesWithItems(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<(MenuTemplate & { items: MenuItem[] })[]> {
  const { data, error } = await client
    .from("menu_templates")
    .select(
      `id, venue_id, name, description, menu_template_items(menu_items(${MENU_ITEM_COLUMNS}))`,
    )
    .eq("venue_id", venueId)
    .is("event_id", null)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((template) => ({
    id: template.id,
    venue_id: template.venue_id,
    name: template.name,
    description: template.description,
    items: (
      (template.menu_template_items ?? []) as unknown as {
        menu_items: MenuItem | null;
      }[]
    )
      .map((link) => link.menu_items)
      .filter((item): item is MenuItem => item !== null),
  }));
}

export async function createMenuTemplate(
  venueId: string,
  name: string,
  description?: string,
): Promise<MenuTemplate> {
  const { data, error } = await resolveSupabaseClient()
    .from("menu_templates")
    .insert({ venue_id: venueId, name, description: description ?? null })
    .select("id, venue_id, name, description")
    .single();
  if (error) throw error;
  return data;
}

export async function updateMenuTemplate(
  templateId: string,
  name: string,
  description: string | null,
): Promise<MenuTemplate> {
  const { data, error } = await resolveSupabaseClient()
    .from("menu_templates")
    .update({ name, description })
    .eq("id", templateId)
    .select("id, venue_id, name, description")
    .single();
  if (error) throw error;
  return data;
}

/**
 * How many events use a package (it is linked in event_menu_templates),
 * split by the event date against the venue's today. A package on an
 * upcoming event can't be deleted (guests may still be choosing it); one used
 * only by past events can, after saying how many lose it.
 */
export async function countEventsUsingTemplate(
  templateId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<{ upcoming: number; past: number }> {
  const { data, error } = await client
    .from("event_menu_templates")
    .select("event_id, events!inner(event_date)")
    .eq("menu_template_id", templateId);
  if (error) throw error;
  const today = todayIn();
  const upcoming = new Set<string>();
  const past = new Set<string>();
  for (const row of data ?? []) {
    const event = (Array.isArray(row.events) ? row.events[0] : row.events) as { event_date: string } | undefined;
    if (!event) continue;
    (event.event_date >= today ? upcoming : past).add(row.event_id as string);
  }
  return { upcoming: upcoming.size, past: past.size };
}

/** Why a package used by upcoming events can't be deleted. */
export function packageInUpcomingEventsMessage(count: number): string {
  return count === 1
    ? "Пакетот се користи во 1 претстоен настан — прво отстранете го од тој настан."
    : `Пакетот се користи во ${count} претстојни настани — прво отстранете го од тие настани.`;
}

/** The delete confirmation for a package used only by past events. */
export function packageInPastEventsMessage(count: number): string {
  return count === 1
    ? "Пакетот ќе се отстрани од 1 поминат настан."
    : `Пакетот ќе се отстрани од ${count} поминати настани.`;
}

export async function deleteMenuTemplate(
  templateId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<void> {
  const { upcoming } = await countEventsUsingTemplate(templateId, client);
  if (upcoming > 0) throw new Error(packageInUpcomingEventsMessage(upcoming));
  const { error } = await client
    .from("menu_templates")
    .delete()
    .eq("id", templateId);
  if (error) throw error;
}

export interface MenuTemplateWithItemCount extends MenuTemplate {
  itemCount: number;
  vegetarianCount: number;
}

export async function listMenuTemplatesWithItemCounts(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<MenuTemplateWithItemCount[]> {
  const { data, error } = await client
    .from("menu_templates")
    .select(
      "id, venue_id, name, description, menu_template_items(menu_items(is_vegetarian))",
    )
    .eq("venue_id", venueId)
    .is("event_id", null)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((template) => {
    const links = (template.menu_template_items ?? []) as unknown as {
      menu_items: { is_vegetarian: boolean } | null;
    }[];
    const items = links
      .map((l) => l.menu_items)
      .filter((i): i is { is_vegetarian: boolean } => i !== null);
    return {
      id: template.id,
      venue_id: template.venue_id,
      name: template.name,
      description: template.description,
      itemCount: items.length,
      vegetarianCount: items.filter((i) => i.is_vegetarian).length,
    };
  });
}

/** The venue's full item pool. */
export async function listMenuItems(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<MenuItem[]> {
  const { data, error } = await client
    .from("menu_items")
    .select(MENU_ITEM_COLUMNS)
    .eq("venue_id", venueId)
    .order("course")
    .order("name");
  if (error) throw error;
  return data;
}

/** The items currently composing one standard-package template. */
export async function listMenuTemplateItems(
  templateId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<MenuItem[]> {
  const { data, error } = await client
    .from("menu_template_items")
    .select(`menu_items(${MENU_ITEM_COLUMNS})`)
    .eq("menu_template_id", templateId);
  if (error) throw error;
  return ((data ?? []) as unknown as { menu_items: MenuItem }[]).map(
    (row) => row.menu_items,
  );
}

/**
 * Replaces a template's composed items wholesale — used by the drag-and-drop
 * package builder. One database call (0118): if any dish can't be added, the
 * package keeps its previous dishes instead of being left empty.
 */
export async function setMenuTemplateItems(
  templateId: string,
  menuItemIds: string[],
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<void> {
  const { error } = await client.rpc("replace_menu_template_items", {
    p_template_id: templateId,
    p_item_ids: menuItemIds,
  });
  if (error) throw error;
}

export async function addMenuItem(input: MenuItemInput): Promise<MenuItem> {
  const { data, error } = await resolveSupabaseClient()
    .from("menu_items")
    .insert(input)
    .select(MENU_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMenuItem(
  itemId: string,
  input: MenuItemUpdateInput,
): Promise<MenuItem> {
  const { data, error } = await resolveSupabaseClient()
    .from("menu_items")
    .update(input)
    .eq("id", itemId)
    .select(MENU_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMenuItem(itemId: string): Promise<void> {
  const { error } = await resolveSupabaseClient()
    .from("menu_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

export type EventCustomMenu = MenuTemplate & {
  items: MenuItem[];
  event: { id: string; couple_names: string; event_date: string };
  /** The menu's guest count in the event's newest sent submission; null if none sent. */
  latestCount: number | null;
};

/** The venue's event-only menus with their event and dishes, by event date. */
export async function listEventCustomMenus(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<EventCustomMenu[]> {
  const { data, error } = await client
    .from("menu_templates")
    .select(
      `id, venue_id, name, description, event_id, events!event_id(id, couple_names, event_date), menu_template_items(menu_items(${MENU_ITEM_COLUMNS}))`,
    )
    .eq("venue_id", venueId)
    .not("event_id", "is", null);
  if (error) throw error;

  const rows = (data ?? []).flatMap((row) => {
    const event = (Array.isArray(row.events) ? row.events[0] : row.events) as
      EventCustomMenu["event"] | undefined;
    return event ? [{ row, event }] : [];
  });
  const eventIds = Array.from(new Set(rows.map((r) => r.event.id)));
  const latestByEvent = new Map<string, Record<string, number>>();
  if (eventIds.length > 0) {
    const { data: subs, error: subsError } = await client
      .from("event_menu_submissions")
      .select("event_id, counts, sent_at")
      .in("event_id", eventIds)
      .order("sent_at", { ascending: false });
    if (subsError) throw subsError;
    for (const sub of subs ?? []) {
      if (!latestByEvent.has(sub.event_id))
        latestByEvent.set(
          sub.event_id,
          (sub.counts ?? {}) as Record<string, number>,
        );
    }
  }

  return rows
    .map(({ row, event }) => ({
      id: row.id,
      venue_id: row.venue_id,
      name: row.name,
      description: row.description,
      items: (
        (row.menu_template_items ?? []) as unknown as {
          menu_items: MenuItem | null;
        }[]
      )
        .map((link) => link.menu_items)
        .filter((item): item is MenuItem => item !== null),
      event,
      latestCount: latestByEvent.get(event.id)?.[row.id] ?? null,
    }))
    .sort((a, b) => a.event.event_date.localeCompare(b.event.event_date));
}
