import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setMenuTemplateItems } from "@/lib/venue/menus";
import { createEvent, deleteEvent, type CreateEventInput } from "@/lib/venue/events";
import { todayIn } from "@/lib/date";

export const DEFAULT_CUSTOM_MENU_NAME = "Сопствено мени";
const FOREIGN_DISH_ERROR = "Едно или повеќе јадења не припаѓаат на овој локал.";

/** Every dish must be one of this venue's (the plain Error is shown to the user). */
async function assertVenueDishes(
  client: SupabaseClient,
  venueId: string,
  itemIds: string[],
): Promise<void> {
  const unique = Array.from(new Set(itemIds));
  if (unique.length === 0) return;
  const { data, error } = await client
    .from("menu_items")
    .select("id")
    .eq("venue_id", venueId)
    .in("id", unique);
  if (error) throw error;
  if ((data ?? []).length !== unique.length) throw new Error(FOREIGN_DISH_ERROR);
}

/**
 * Creates or updates the event's custom menu (one per event): a
 * menu_templates row with event_id set, linked to the event, whose dishes are
 * replaced wholesale. Written with the service-role client (staff RLS cannot
 * touch event-only menus); the caller has already checked the event is the
 * venue's. Every dish must be one of this venue's.
 */
export async function saveEventCustomMenu(
  client: SupabaseClient,
  venueId: string,
  eventId: string,
  input: { name: string; itemIds: string[] },
): Promise<{ id: string }> {
  const itemIds = Array.from(new Set(input.itemIds));
  await assertVenueDishes(client, venueId, itemIds);
  const name = input.name.trim() || DEFAULT_CUSTOM_MENU_NAME;

  const findExisting = () =>
    client
      .from("menu_templates")
      .select("id")
      .eq("venue_id", venueId)
      .eq("event_id", eventId)
      .limit(1)
      .maybeSingle();
  let existing = await findExisting();
  if (existing.error) throw existing.error;

  let id: string;
  let createdId: string | null = null;
  if (!existing.data) {
    const created = await client
      .from("menu_templates")
      .insert({ venue_id: venueId, event_id: eventId, name })
      .select("id")
      .single();
    if (!created.error) {
      createdId = created.data.id;
    } else if (created.error.code === "23505") {
      // Another save just created it (one custom menu per event): update that one.
      existing = await findExisting();
      if (existing.error || !existing.data) throw created.error;
    } else {
      throw created.error;
    }
    if (createdId) {
      const link = await client
        .from("event_menu_templates")
        .insert({ event_id: eventId, menu_template_id: createdId });
      if (link.error) {
        // No half-made menu left behind (its dishes are not set yet).
        await client.from("menu_templates").delete().eq("id", createdId);
        throw link.error;
      }
    }
  }
  if (createdId) {
    id = createdId;
  } else {
    id = existing.data!.id;
    const { error } = await client
      .from("menu_templates")
      .update({ name })
      .eq("id", id);
    if (error) throw error;
    // The menu exists but its link may not (e.g. a form saved without it):
    // make sure the event still offers it.
    const link = await client
      .from("event_menu_templates")
      .insert({ event_id: eventId, menu_template_id: id });
    if (link.error && link.error.code !== "23505") throw link.error;
  }

  await setMenuTemplateItems(id, itemIds, client);
  return { id };
}

/**
 * Creates the event and, when given, its custom menu (the new-event form
 * builds both). The dishes are checked before anything is written; if the
 * menu still fails to save, the just-created event is removed again so the
 * manager never ends up with an event missing the menu they built.
 */
export async function createEventWithCustomMenu(
  client: SupabaseClient,
  input: CreateEventInput,
  customMenu: { name: string; itemIds: string[] } | null,
): Promise<{ id: string }> {
  if (customMenu) await assertVenueDishes(client, input.venue_id, customMenu.itemIds);
  const event = await createEvent(input, client);
  if (!customMenu) return event;
  try {
    await saveEventCustomMenu(client, input.venue_id, event.id, customMenu);
  } catch (err) {
    // The menu's own error is the one worth reporting; a failed cleanup
    // leaves an ordinary event the manager can still edit or delete.
    await deleteEvent(event.id, input.venue_id, client).catch(() => undefined);
    throw err;
  }
  return event;
}

/** A refusal a route turns into a status code (message is shown to the user). */
export class CustomMenuError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

const NOT_FOUND_ERROR = "Менито не е пронајдено.";
const ONLY_PAST_ERROR =
  "Може да се избрише само сопствено мени од поминат настан.";

async function loadEventOnlyMenu(
  client: SupabaseClient,
  venueId: string,
  templateId: string,
) {
  const { data, error } = await client
    .from("menu_templates")
    .select("id, name, event_id, events!event_id(event_date)")
    .eq("id", templateId)
    .eq("venue_id", venueId)
    .not("event_id", "is", null)
    .maybeSingle();
  if (error) throw error;
  const event = (
    Array.isArray(data?.events) ? data?.events[0] : data?.events
  ) as { event_date: string } | undefined;
  if (!data || !event) throw new CustomMenuError(NOT_FOUND_ERROR, 404);
  return { id: data.id as string, name: data.name as string, event };
}

/**
 * Deletes an event-only menu of a past event (date before today, venue time).
 * Its event link and guests' counts cascade; sent submissions keep their
 * stored titles. Anything else is refused.
 */
export async function deletePastCustomMenu(
  client: SupabaseClient,
  venueId: string,
  templateId: string,
): Promise<void> {
  const menu = await loadEventOnlyMenu(client, venueId, templateId);
  if (menu.event.event_date >= todayIn())
    throw new CustomMenuError(ONLY_PAST_ERROR, 409);
  const { error } = await client
    .from("menu_templates")
    .delete()
    .eq("id", templateId)
    .eq("venue_id", venueId);
  if (error) throw error;
}

/** Makes a standard package (event_id null) with the custom menu's dishes. */
export async function copyCustomMenuToPackage(
  client: SupabaseClient,
  venueId: string,
  templateId: string,
): Promise<{ id: string }> {
  const menu = await loadEventOnlyMenu(client, venueId, templateId);
  const { data: links, error: linkError } = await client
    .from("menu_template_items")
    .select("menu_item_id")
    .eq("menu_template_id", templateId);
  if (linkError) throw linkError;
  const created = await client
    .from("menu_templates")
    .insert({
      venue_id: venueId,
      // The event date, not the couple's names: a standard package outlives
      // the event's personal-data erasure.
      name: `${menu.name} (${menu.event.event_date.split("-").reverse().join(".")})`,
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  try {
    await setMenuTemplateItems(
      created.data.id,
      (links ?? []).map((l) => l.menu_item_id as string),
      client,
    );
  } catch (err) {
    await client.from("menu_templates").delete().eq("id", created.data.id);
    throw err;
  }
  return { id: created.data.id };
}
