import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

export interface MenuTemplate {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
}

/** 'everyday' = the restaurant's regular menu. 'special' = only offered for
 * weddings/graduations/etc — the pool standard packages and event custom
 * menus are built from. An item can carry both tags at once (e.g. a dish
 * sold daily that's also offered at weddings), so `tiers` is a set, not a
 * single value. */
export type MenuItemTier = "everyday" | "special";

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

const MENU_ITEM_COLUMNS = "id, venue_id, tiers, course, name, allergen_tags, is_vegetarian, is_vegan, price, photo_path";

const MENU_ITEM_PHOTOS_BUCKET = "menu-item-photos";
const PHOTO_CACHE_SECONDS = "31536000";

export function getMenuItemPhotoUrl(photoPath: string | null): string | null {
  if (!photoPath) return null;
  const { data } = resolveSupabaseClient().storage.from(MENU_ITEM_PHOTOS_BUCKET).getPublicUrl(photoPath);
  return data.publicUrl;
}

export async function uploadMenuItemPhoto(venueId: string, itemId: string, file: File): Promise<string> {
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
  client: SupabaseClient = resolveSupabaseClient()
): Promise<MenuTemplate[]> {
  const { data, error } = await client
    .from("menu_templates")
    .select("id, venue_id, name, description")
    .eq("venue_id", venueId)
    .order("name");
  if (error) throw error;
  return data;
}

/** Every template plus its composed items, in one call — used wherever a
 * menu's full contents need to be displayed (not just its name). */
export async function listMenuTemplatesWithItems(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<(MenuTemplate & { items: MenuItem[] })[]> {
  const { data, error } = await client
    .from("menu_templates")
    .select(`id, venue_id, name, description, menu_template_items(menu_items(${MENU_ITEM_COLUMNS}))`)
    .eq("venue_id", venueId)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((template) => ({
    id: template.id,
    venue_id: template.venue_id,
    name: template.name,
    description: template.description,
    items: ((template.menu_template_items ?? []) as unknown as { menu_items: MenuItem | null }[])
      .map((link) => link.menu_items)
      .filter((item): item is MenuItem => item !== null),
  }));
}

export async function createMenuTemplate(venueId: string, name: string, description?: string): Promise<MenuTemplate> {
  const { data, error } = await resolveSupabaseClient()
    .from("menu_templates")
    .insert({ venue_id: venueId, name, description: description ?? null })
    .select("id, venue_id, name, description")
    .single();
  if (error) throw error;
  return data;
}

export async function updateMenuTemplate(templateId: string, name: string, description: string | null): Promise<MenuTemplate> {
  const { data, error } = await resolveSupabaseClient()
    .from("menu_templates")
    .update({ name, description })
    .eq("id", templateId)
    .select("id, venue_id, name, description")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMenuTemplate(templateId: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("menu_templates").delete().eq("id", templateId);
  if (error) throw error;
}

export interface MenuTemplateWithItemCount extends MenuTemplate {
  itemCount: number;
  vegetarianCount: number;
}

export async function listMenuTemplatesWithItemCounts(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<MenuTemplateWithItemCount[]> {
  const { data, error } = await client
    .from("menu_templates")
    .select("id, venue_id, name, description, menu_template_items(menu_items(is_vegetarian))")
    .eq("venue_id", venueId)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((template) => {
    const links = (template.menu_template_items ?? []) as unknown as { menu_items: { is_vegetarian: boolean } | null }[];
    const items = links.map((l) => l.menu_items).filter((i): i is { is_vegetarian: boolean } => i !== null);
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

/** The venue's full item pool, optionally narrowed to one tier. */
export async function listMenuItems(
  venueId: string,
  tier?: MenuItemTier,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<MenuItem[]> {
  let query = client.from("menu_items").select(MENU_ITEM_COLUMNS).eq("venue_id", venueId);
  if (tier) query = query.contains("tiers", [tier]);
  const { data, error } = await query.order("course").order("name");
  if (error) throw error;
  return data;
}

/** The items currently composing one standard-package template. */
export async function listMenuTemplateItems(
  templateId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<MenuItem[]> {
  const { data, error } = await client
    .from("menu_template_items")
    .select(`menu_items(${MENU_ITEM_COLUMNS})`)
    .eq("menu_template_id", templateId);
  if (error) throw error;
  return ((data ?? []) as unknown as { menu_items: MenuItem }[]).map((row) => row.menu_items);
}

/** Replaces a template's composed items wholesale — used by the drag-and-drop package builder. */
export async function setMenuTemplateItems(
  templateId: string,
  menuItemIds: string[],
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { error: deleteError } = await client.from("menu_template_items").delete().eq("menu_template_id", templateId);
  if (deleteError) throw deleteError;
  if (menuItemIds.length > 0) {
    const { error: insertError } = await client
      .from("menu_template_items")
      .insert(menuItemIds.map((menu_item_id) => ({ menu_template_id: templateId, menu_item_id })));
    if (insertError) throw insertError;
  }
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

export async function updateMenuItem(itemId: string, input: MenuItemUpdateInput): Promise<MenuItem> {
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
  const { error } = await resolveSupabaseClient().from("menu_items").delete().eq("id", itemId);
  if (error) throw error;
}
