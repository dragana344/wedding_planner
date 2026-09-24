// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listLocations, addLocation, updateLocation, deleteLocation } from "@/lib/couple/locations";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/locations", () => {
  it("adds, lists in order, updates, and deletes locations", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Locations Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Locations Couple", event_date: "2027-03-01" })
      .select()
      .single();

    const church = await addLocation(event!.id, { label: "Црква", address: "Ул. Св. Петка 1", map_url: null });
    const restaurant = await addLocation(event!.id, { label: "Ресторан", address: null, map_url: "https://maps.example/x" });
    expect(church.sort_order).toBe(0);
    expect(restaurant.sort_order).toBe(1);

    const listed = await listLocations(event!.id);
    expect(listed.map((l) => l.label)).toEqual(["Црква", "Ресторан"]);

    const updated = await updateLocation(event!.id, church.id, { label: "Црква Св. Петка", address: "Ул. Св. Петка 1", map_url: null });
    expect(updated.label).toBe("Црква Св. Петка");

    await deleteLocation(event!.id, restaurant.id);
    expect(await listLocations(event!.id)).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("refuses to update or delete a location belonging to a different event", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Locations Scope Venue" }).select().single();
    const { data: eventA } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "A", event_date: "2027-03-02" }).select().single();
    const { data: eventB } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "B", event_date: "2027-03-03" }).select().single();

    const location = await addLocation(eventA!.id, { label: "A's place", address: null, map_url: null });
    await expect(updateLocation(eventB!.id, location.id, { label: "hijacked", address: null, map_url: null })).rejects.toThrow();
    await deleteLocation(eventB!.id, location.id);
    expect(await listLocations(eventA!.id)).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
