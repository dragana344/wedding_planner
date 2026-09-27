// tests/lib/couple/dashboard.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getEventSummary } from "@/lib/couple/dashboard";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/dashboard: getEventSummary", () => {
  it("assembles the couple's event summary, including rooms, seated count, and menu status", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Dashboard Lib Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Hall" }).select().single();
    const { data: tableType } = await admin
      .from("table_types")
      .insert({ room_id: room!.id, name: "Round-8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 5 })
      .select()
      .single();
    const { data: template } = await admin
      .from("menu_templates")
      .insert({ venue_id: venue!.id, name: "Classic Menu" })
      .select()
      .single();
    const { data: event } = await admin
      .from("events")
      .insert({
        venue_id: venue!.id,
        couple_names: "Dashboard & Test",
        event_date: "2026-12-05",
        guest_count_estimate: 50,
        menu_template_id: template!.id,
        contact_email: "couple@example.com",
      })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });
    await admin.from("event_layout_elements").insert({
      event_id: event!.id,
      room_id: room!.id,
      element_type: "table",
      table_type_id: tableType!.id,
      x_cm: 0,
      y_cm: 0,
      width_cm: 150,
      length_cm: 150,
    });

    const summary = await getEventSummary(event!.id);
    expect(summary.couple_names).toBe("Dashboard & Test");
    expect(summary.venue_name).toBe("Dashboard Lib Venue");
    expect(summary.rooms).toEqual([{ id: room!.id, name: "Hall" }]);
    expect(summary.seatedCount).toBe(8);
    expect(summary.menuStatus).toEqual({ kind: "template", name: "Classic Menu" });
    expect(summary.contact_email).toBe("couple@example.com");

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("reports a custom menu status when the event has custom menu items instead of a template", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Dashboard Lib Venue 2" }).select().single();
    const { data: item } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Dish" })
      .select()
      .single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Custom & Menu", event_date: "2026-12-10" })
      .select()
      .single();
    await admin.from("event_custom_menu_items").insert({ event_id: event!.id, menu_item_id: item!.id });

    const summary = await getEventSummary(event!.id);
    expect(summary.menuStatus).toEqual({ kind: "custom", itemCount: 1 });

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
