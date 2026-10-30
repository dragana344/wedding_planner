// tests/lib/couple/invitations.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getInvitation, upsertInvitation, getInvitationBySlug } from "@/lib/couple/invitations";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/invitations", () => {
  it("creates an invitation on first upsert, keeps the same slug on later upserts, and is readable by slug", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Invitation Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Hall" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Invitation Couple", event_date: "2027-06-01" })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });

    expect(await getInvitation(event!.id)).toBeNull();

    const created = await upsertInvitation(event!.id, { template_id: "romantic-floral", message: "Се гледаме!" });
    expect(created.public_slug).toBeTruthy();

    const updated = await upsertInvitation(event!.id, { template_id: "elegant-gold", message: "Изменета порака" });
    expect(updated.public_slug).toBe(created.public_slug);
    expect(updated.template_id).toBe("elegant-gold");

    const public_ = await getInvitationBySlug(created.public_slug);
    expect(public_?.couple_names).toBe("Invitation Couple");
    expect(public_?.venue_name).toBe("Invitation Venue");
    expect(public_?.room_names).toEqual(["Hall"]);
    expect(public_?.template_id).toBe("elegant-gold");

    expect(await getInvitationBySlug("no-such-slug")).toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("carries the programme guests need: agenda (no private notes), locations and each of the event's menus with its dishes (A14)", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Programme Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Programme Couple", event_date: "2027-06-02", event_type: "wedding" })
      .select()
      .single();
    await admin.from("event_agenda_items").insert([
      { event_id: event!.id, time: "18:00", title: "Венчавка", notes: "приватна белешка", sort_order: 1 },
      { event_id: event!.id, time: "16:00", title: "Собирање", sort_order: 0 },
    ]);
    await admin.from("event_locations").insert({ event_id: event!.id, label: "Црква", address: "Радовиш", map_url: "https://maps.app.goo.gl/x", sort_order: 0 });
    const { data: items } = await admin
      .from("menu_items")
      .insert([
        { venue_id: venue!.id, tiers: ["special"], course: "main", name: "Печено пиле" },
        { venue_id: venue!.id, tiers: ["special"], course: "starter", name: "Мезе" },
      ])
      .select("id");
    const { data: tpl } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Свадбено" }).select().single();
    await admin.from("menu_template_items").insert(items!.map((i) => ({ menu_template_id: tpl!.id, menu_item_id: i.id })));
    await admin.from("event_menu_templates").insert({ event_id: event!.id, menu_template_id: tpl!.id });
    const { public_slug } = await upsertInvitation(event!.id, { template_id: "elegant-gold", message: null });

    const invitation = await getInvitationBySlug(public_slug);
    expect(invitation?.event_type).toBe("wedding");
    expect(invitation?.agenda).toEqual([
      { time: "16:00", title: "Собирање" },
      { time: "18:00", title: "Венчавка" },
    ]);
    expect(JSON.stringify(invitation)).not.toContain("приватна белешка");
    expect(invitation?.locations).toEqual([{ label: "Црква", address: "Радовиш", map_url: "https://maps.app.goo.gl/x" }]);
    expect(invitation?.menus).toEqual([
      {
        id: tpl!.id,
        name: "Свадбено",
        dishes: [
          { course: "starter", name: "Мезе" },
          { course: "main", name: "Печено пиле" },
        ],
      },
    ]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
