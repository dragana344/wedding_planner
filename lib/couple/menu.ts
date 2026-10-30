// lib/couple/menu.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sortDishes, type ProgramDish } from "@/lib/couple/invitation-program";

export type CoupleEventMenu = {
  id: string;
  name: string;
  /** An event-only menu built by the manager (menu_templates.event_id set). */
  isCustom: boolean;
  dishes: ProgramDish[];
};

type DishRow = { name: string; course: ProgramDish["course"] };
type MenuRow = {
  id: string;
  name: string;
  event_id: string | null;
  menu_template_items: { menu_items: DishRow | DishRow[] | null }[] | null;
};
type LinkRow = { menu_templates: MenuRow | MenuRow[] | null };

/**
 * The menus the venue manager put on this event (event_menu_templates),
 * custom ones included, by name then id. The couple only views them.
 */
export async function getEventMenus(eventId: string): Promise<CoupleEventMenu[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_menu_templates")
    .select("menu_templates(id, name, event_id, menu_template_items(menu_items(name, course)))")
    .eq("event_id", eventId);
  if (error) throw error;

  return ((data ?? []) as unknown as LinkRow[])
    .map((link) => (Array.isArray(link.menu_templates) ? link.menu_templates[0] : link.menu_templates))
    .filter((t): t is MenuRow => Boolean(t))
    .map((t) => ({
      id: t.id,
      name: t.name,
      isCustom: t.event_id !== null,
      dishes: sortDishes(
        (t.menu_template_items ?? [])
          .map((row) => (Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items))
          .filter((d): d is DishRow => Boolean(d))
          .map((d) => ({ course: d.course, name: d.name })),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "mk") || a.id.localeCompare(b.id));
}
