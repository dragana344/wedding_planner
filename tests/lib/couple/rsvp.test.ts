// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { upsertInvitation } from "@/lib/couple/invitations";
import { getInviteeByToken, submitRsvpBySlug } from "@/lib/couple/rsvp";

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

    await submitRsvpBySlug(slug, { fullName: "mila milova", status: "confirmed", partySize: 3 });

    const { data: updated } = await admin.from("event_guests").select("*").eq("id", guest!.id).single();
    expect(updated!.rsvp_status).toBe("confirmed");
    expect(updated!.party_size).toBe(3);
    expect(updated!.side).toBe("bride");

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("creates a new guest when no name matches", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Unmatched Couple");

    await submitRsvpBySlug(slug, { fullName: "Petar Petrovski", status: "confirmed", partySize: 2 });

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

    await submitRsvpBySlug(slug, { fullName: "Ana Petrovska", status: "confirmed", partySize: 1 });

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

    await submitRsvpBySlug(slug, { fullName: "Jovan Jovanovski", status: "declined", partySize: 1 });

    const { data: updated } = await admin.from("event_guests").select("*").eq("id", guest!.id).single();
    expect(updated!.rsvp_status).toBe("declined");
    expect(updated!.party_size).toBe(2);

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("sets a new declined guest's party size to 1, respecting the party_size > 0 constraint", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("New Decline Couple");

    await submitRsvpBySlug(slug, { fullName: "Someone Else", status: "declined", partySize: 5 });

    const { data: guests } = await admin.from("event_guests").select("*").eq("event_id", eventId);
    expect(guests![0].rsvp_status).toBe("declined");
    expect(guests![0].party_size).toBe(1);

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("rejects a blank name and an unknown slug", async () => {
    const { venueId, slug } = await makeEventWithInvitation("Validation Couple");

    await expect(submitRsvpBySlug(slug, { fullName: "   ", status: "confirmed", partySize: 1 })).rejects.toThrow();
    await expect(submitRsvpBySlug("no-such-slug", { fullName: "Someone", status: "confirmed", partySize: 1 })).rejects.toThrow();

    await admin.from("venues").delete().eq("id", venueId);
  });
});

async function addGuest(eventId: string, fields: Record<string, unknown> = {}) {
  const { data } = await admin
    .from("event_guests")
    .insert({ event_id: eventId, full_name: "Петар Петровски", rsvp_status: "invited", party_size: 1, ...fields })
    .select("id, invite_token")
    .single();
  return data!;
}

describe("lib/couple/rsvp: personal invite links (A1)", () => {
  it("finds the guest a token belongs to, only within that invitation's event", async () => {
    const mine = await makeEventWithInvitation("Token Couple");
    const other = await makeEventWithInvitation("Other Token Couple");
    const guest = await addGuest(mine.eventId, { party_size: 3, side: "groom" });
    const stranger = await addGuest(other.eventId);

    const invitee = await getInviteeByToken(mine.slug, guest.invite_token);
    expect(invitee).toMatchObject({ fullName: "Петар Петровски", rsvpStatus: "invited", partySize: 3 });
    // Only what the guest's own page needs: no id, token, side or notes.
    expect(Object.keys(invitee!).sort()).toEqual(
      ["allergies", "childrenCount", "fullName", "menuChoice", "partySize", "rsvpComment", "rsvpStatus"].sort(),
    );

    expect(await getInviteeByToken(mine.slug, stranger.invite_token)).toBeNull();
    expect(await getInviteeByToken(mine.slug, "A".repeat(24))).toBeNull();
    expect(await getInviteeByToken(mine.slug, "not a token")).toBeNull();
    expect(await getInviteeByToken("no-such-slug", guest.invite_token)).toBeNull();

    await admin.from("venues").delete().in("id", [mine.venueId, other.venueId]);
  });

  it("answers for the token's guest without a name", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Token Answer Couple");
    const guest = await addGuest(eventId);

    await submitRsvpBySlug(slug, { guestToken: guest.invite_token, status: "confirmed", partySize: 2 });

    const { data: rows } = await admin.from("event_guests").select("*").eq("event_id", eventId);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ id: guest.id, rsvp_status: "confirmed", party_size: 2, rsvp_previous_status: "invited" });
    expect(rows![0].rsvp_changed_via_link_at).not.toBeNull();

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("uses the token's guest even when a submitted name points at someone else", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Token Wins Couple");
    const guest = await addGuest(eventId);
    const namesake = await addGuest(eventId, { full_name: "Ана Анова" });

    await submitRsvpBySlug(slug, { guestToken: guest.invite_token, fullName: "Ана Анова", status: "declined", partySize: 1 });

    const { data: g } = await admin.from("event_guests").select("rsvp_status").eq("id", guest.id).single();
    const { data: n } = await admin.from("event_guests").select("rsvp_status").eq("id", namesake.id).single();
    expect(g!.rsvp_status).toBe("declined");
    expect(n!.rsvp_status).toBe("invited");

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("rejects a token from another event or an unknown token, changing nothing", async () => {
    const mine = await makeEventWithInvitation("Reject Token Couple");
    const other = await makeEventWithInvitation("Reject Other Couple");
    const stranger = await addGuest(other.eventId);

    await expect(
      submitRsvpBySlug(mine.slug, { guestToken: stranger.invite_token, status: "confirmed", partySize: 1 }),
    ).rejects.toThrow("Поканата не е пронајдена.");
    await expect(submitRsvpBySlug(mine.slug, { guestToken: "B".repeat(24), status: "confirmed", partySize: 1 })).rejects.toThrow(
      "Поканата не е пронајдена.",
    );

    const { data: s } = await admin.from("event_guests").select("rsvp_status").eq("id", stranger.id).single();
    expect(s!.rsvp_status).toBe("invited");
    const { count } = await admin.from("event_guests").select("id", { count: "exact", head: true }).eq("event_id", mine.eventId);
    expect(count).toBe(0);

    await admin.from("venues").delete().in("id", [mine.venueId, other.venueId]);
  });
});

describe("lib/couple/rsvp: full answers (A2-A5)", () => {
  it("stores 'later' without touching the party size, and records what it replaced", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Later Couple");
    const guest = await addGuest(eventId, { party_size: 4, rsvp_status: "confirmed" });

    await submitRsvpBySlug(slug, { guestToken: guest.invite_token, status: "later", partySize: 1 });

    const { data } = await admin.from("event_guests").select("*").eq("id", guest.id).single();
    expect(data).toMatchObject({ rsvp_status: "later", party_size: 4, rsvp_previous_status: "confirmed" });

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("stores children, menu, allergies and comment with a yes", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Full Answer Couple");
    const guest = await addGuest(eventId);

    await submitRsvpBySlug(slug, {
      guestToken: guest.invite_token,
      status: "confirmed",
      partySize: 3,
      childrenCount: 1,
      menuChoice: "posno",
      allergies: "  ореви  ",
      comment: "  Доаѓаме со радост!  ",
    });

    const { data } = await admin.from("event_guests").select("*").eq("id", guest.id).single();
    expect(data).toMatchObject({
      rsvp_status: "confirmed",
      party_size: 3,
      children_count: 1,
      menu_choice: "posno",
      allergies: "ореви",
      rsvp_comment: "Доаѓаме со радост!",
    });
    expect(await getInviteeByToken(slug, guest.invite_token)).toMatchObject({
      rsvpStatus: "confirmed",
      childrenCount: 1,
      menuChoice: "posno",
      allergies: "ореви",
      rsvpComment: "Доаѓаме со радост!",
    });

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("keeps the comment but not the menu details with a no, and a new guest gets the answer too", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("No Answer Couple");
    const guest = await addGuest(eventId, { menu_choice: "standard", children_count: 2 });

    await submitRsvpBySlug(slug, {
      guestToken: guest.invite_token,
      status: "declined",
      partySize: 1,
      childrenCount: 5,
      menuChoice: "vegetarian",
      comment: "Жал ни е",
    });
    const { data } = await admin.from("event_guests").select("*").eq("id", guest.id).single();
    expect(data).toMatchObject({ rsvp_status: "declined", rsvp_comment: "Жал ни е", menu_choice: "standard", children_count: 2 });

    await submitRsvpBySlug(slug, { fullName: "Нов Гостин", status: "confirmed", partySize: 2, childrenCount: 1, menuChoice: "vegetarian" });
    const { data: created } = await admin.from("event_guests").select("*").eq("event_id", eventId).eq("full_name", "Нов Гостин").single();
    expect(created).toMatchObject({ rsvp_status: "confirmed", party_size: 2, children_count: 1, menu_choice: "vegetarian" });

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("clears an emptied comment", async () => {
    const { venueId, eventId, slug } = await makeEventWithInvitation("Clear Comment Couple");
    const guest = await addGuest(eventId, { rsvp_comment: "стар коментар" });
    await submitRsvpBySlug(slug, { guestToken: guest.invite_token, status: "later", partySize: 1, comment: "   " });
    const { data } = await admin.from("event_guests").select("rsvp_comment").eq("id", guest.id).single();
    expect(data!.rsvp_comment).toBeNull();
    await admin.from("venues").delete().eq("id", venueId);
  });
});
