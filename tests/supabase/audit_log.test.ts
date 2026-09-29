import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { submitRsvpBySlug } from "@/lib/couple/rsvp";

// SEC-018 / SEC-021: sensitive actions write exactly one append-only audit
// row; public RSVP changes are recorded and visible on the guest.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let staffId: string;
let staff: SupabaseClient;

async function auditRows(filter: { event_id?: string; action?: string; target_id?: string }) {
  let q = admin.from("audit_log").select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data } = await q;
  return data ?? [];
}

beforeAll(async () => {
  const { data: venues } = await admin.from("venues").insert([{ name: "Audit Venue" }, { name: "Other Audit Venue" }]).select("id");
  [venueId, otherVenueId] = venues!.map((v) => v.id);
  const { data: user } = await admin.auth.admin.createUser({ email: `audit-${stamp}@test.local`, password: "test-password-123", email_confirm: true });
  staffId = user.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffId, venue_id: venueId });
  staff = createClient(url, anonKey, { auth: { persistSession: false } });
  await staff.auth.signInWithPassword({ email: `audit-${stamp}@test.local`, password: "test-password-123" });
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(staffId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

async function newEvent(venue = venueId) {
  const { data } = await admin
    .from("events")
    .insert({ venue_id: venue, couple_names: "Audit & Test", event_date: "2027-09-01" })
    .select("id")
    .single();
  return data!.id as string;
}

describe("audit log (SEC-018)", () => {
  it("records couple credential creation and regeneration by staff, once each, with the staff user as actor", async () => {
    const eventId = await newEvent();
    expect((await staff.rpc("create_event_credentials", { p_event_id: eventId, p_username: `audit-${stamp}`, p_password: "long-enough-1" })).error).toBeNull();
    expect((await staff.rpc("regenerate_event_password", { p_event_id: eventId, p_password: "long-enough-2" })).error).toBeNull();

    const rows = await auditRows({ event_id: eventId });
    expect(rows.map((r) => r.action).sort()).toEqual(["couple_credentials_created", "couple_password_regenerated"]);
    for (const r of rows) expect(r).toMatchObject({ actor_type: "staff", actor_id: staffId, venue_id: venueId });
  });

  it("records an event deletion by staff, without personal data", async () => {
    const eventId = await newEvent();
    expect((await staff.from("events").delete().eq("id", eventId)).error).toBeNull();
    const rows = await auditRows({ event_id: eventId, action: "event_deleted" });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain("Audit & Test");
  });

  it("cannot be changed or deleted by staff or even the service role", async () => {
    const eventId = await newEvent();
    await staff.from("events").delete().eq("id", eventId);
    const [row] = await auditRows({ event_id: eventId });

    await staff.from("audit_log").update({ action: "tampered" }).eq("id", row.id);
    await staff.from("audit_log").delete().eq("id", row.id);
    expect((await admin.from("audit_log").update({ action: "tampered" }).eq("id", row.id)).error).not.toBeNull();
    expect((await admin.from("audit_log").delete().eq("id", row.id)).error).not.toBeNull();
    expect((await staff.from("audit_log").insert({ actor_type: "staff", action: "forged", venue_id: venueId })).error).not.toBeNull();

    const [after] = await auditRows({ event_id: eventId });
    expect(after.action).toBe("event_deleted");
  });

  it("shows staff their own venue's trail only; anon sees nothing", async () => {
    const otherEvent = await newEvent(otherVenueId);
    await admin.from("events").delete().eq("id", otherEvent);
    const { data: mine } = await staff.from("audit_log").select("venue_id");
    expect(mine!.length).toBeGreaterThan(0);
    expect(new Set(mine!.map((r) => r.venue_id))).toEqual(new Set([venueId]));
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: anonRows } = await anon.from("audit_log").select("id");
    expect(anonRows ?? []).toEqual([]);
  });
});

describe("public RSVP changes (SEC-021)", () => {
  it("records each change and shows the couple when the link changed it and from what", async () => {
    const eventId = await newEvent();
    const slug = `audit${stamp}`.slice(0, 20);
    await admin.from("event_invitations").insert({ event_id: eventId, template_id: "classic", public_slug: slug });
    const { data: guest } = await admin
      .from("event_guests")
      .insert({ event_id: eventId, full_name: "Марко Илиевски", rsvp_status: "confirmed" })
      .select("id")
      .single();

    await submitRsvpBySlug(slug, { fullName: "марко илиевски", attending: false, partySize: 1 }, { ip: "203.0.113.9", requestId: "req-1" });
    await submitRsvpBySlug(slug, { fullName: "Марко Илиевски", attending: true, partySize: 2 }, { ip: "198.51.100.4", requestId: "req-2" });

    const { data: after } = await admin.from("event_guests").select("rsvp_status, rsvp_previous_status, rsvp_changed_via_link_at").eq("id", guest!.id).single();
    expect(after).toMatchObject({ rsvp_status: "confirmed", rsvp_previous_status: "declined" });
    expect(after!.rsvp_changed_via_link_at).not.toBeNull();

    const rows = (await auditRows({ target_id: guest!.id })).sort((a, b) => a.id - b.id);
    expect(rows.map((r) => [r.details.previous_status, r.details.new_status])).toEqual([
      ["confirmed", "declined"],
      ["declined", "confirmed"],
    ]);
    expect(rows.map((r) => r.request_id)).toEqual(["req-1", "req-2"]);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.9");
    expect(JSON.stringify(rows)).not.toContain("Марко");
  });
});
