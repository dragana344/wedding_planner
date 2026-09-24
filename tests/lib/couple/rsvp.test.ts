// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { upsertInvitation } from "@/lib/couple/invitations";
import { submitRsvpBySlug } from "@/lib/couple/rsvp";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function makeEventWithInvitation(coupleNames: string) {
  const { data: venue } = await admin.from("venues").insert({ name: `RSVP Venue ${coupleNames}` }).select().single();
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venue!.id, couple_names: coupleNames, event_date: "2027-07-01" })
    .select()
    .single();
  const invitation = await upsertInvitation(event!.id, { template_id: "romantic-floral", message: null });
  return { venueId: venue!.id, eventId: event!.id, slug: invitation.public_slug };
}

describe("lib/couple/rsvp: submitRsvpBySlug", () => {
  it("updates an existing guest's status and party size, keeping their side untouched", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Match Couple");
    const { data: guest } = await admin
      .from("event_guests")
      .insert({ event_id: eventId, full_name: "Mila Milova", rsvp_status: "pending", party_size: 1, side: "bride" })
      .select()
      .single();

    await submitRsvpBySlug(slug, { fullName: "mila milova", attending: true, partySize: 3 });

    const { data: updated } = await admin.from("event_guests").select("*").eq("id", guest!.id).single();
    expect(updated!.rsvp_status).toBe("confirmed");
    expect(updated!.party_size).toBe(3);
    expect(updated!.side).toBe("bride");

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("creates a new guest when no name matches", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Unmatched Couple");

    await submitRsvpBySlug(slug, { fullName: "Petar Petrovski", attending: true, partySize: 2 });

    const { data: guests } = await admin.from("event_guests").select("*").eq("event_id", eventId);
    expect(guests).toHaveLength(1);
    expect(guests![0].full_name).toBe("Petar Petrovski");
    expect(guests![0].rsvp_status).toBe("confirmed");
    expect(guests![0].party_size).toBe(2);
    expect(guests![0].side).toBeNull();

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("creates a new guest instead of guessing when the name matches more than one existing guest", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Duplicate Name Couple");
    await admin.from("event_guests").insert([
      { event_id: eventId, full_name: "Ana Petrovska", rsvp_status: "pending", party_size: 1 },
      { event_id: eventId, full_name: "Ana Petrovska", rsvp_status: "pending", party_size: 1 },
    ]);

    await submitRsvpBySlug(slug, { fullName: "Ana Petrovska", attending: true, partySize: 1 });

    const { data: guests } = await admin.from("event_guests").select("*").eq("event_id", eventId);
    expect(guests).toHaveLength(3);
    expect(guests!.every((g) => g.rsvp_status === "pending" || g.rsvp_status === "confirmed")).toBe(true);
    // Neither of the original two ambiguous rows was silently overwritten.
    expect(guests!.filter((g) => g.rsvp_status === "pending")).toHaveLength(2);

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("does not overwrite an existing guest's party size when declining", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Decline Couple");
    const { data: guest } = await admin
      .from("event_guests")
      .insert({ event_id: eventId, full_name: "Jovan Jovanovski", rsvp_status: "invited", party_size: 2 })
      .select()
      .single();

    await submitRsvpBySlug(slug, { fullName: "Jovan Jovanovski", attending: false, partySize: 1 });

    const { data: updated } = await admin.from("event_guests").select("*").eq("id", guest!.id).single();
    expect(updated!.rsvp_status).toBe("declined");
    expect(updated!.party_size).toBe(2);

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("sets a new declined guest's party size to 1, respecting the party_size > 0 constraint", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("New Decline Couple");

    await submitRsvpBySlug(slug, { fullName: "Someone Else", attending: false, partySize: 5 });

    const { data: guests } = await admin.from("event_guests").select("*").eq("event_id", eventId);
    expect(guests![0].rsvp_status).toBe("declined");
    expect(guests![0].party_size).toBe(1);

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("rejects a blank name and an unknown slug", async () => {
    const { venueId, slug } = await makeEventWithInvitation("Validation Couple");

    await expect(submitRsvpBySlug(slug, { fullName: "   ", attending: true, partySize: 1 })).rejects.toThrow();
    await expect(submitRsvpBySlug("no-such-slug", { fullName: "Someone", attending: true, partySize: 1 })).rejects.toThrow();

    await admin.from("venues").delete().eq("id", venueId);
  });
});
