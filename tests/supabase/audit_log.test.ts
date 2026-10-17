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
  it("records couple credential creation without a staff actor, now that it's gated through a service-role route (security review fix, same tradeoff as password regeneration below)", async () => {
    // Migration 0110: create_event_credentials is no longer callable by a
    // plain authenticated staff session at all — only via the gated
    // event-creation route, which calls it with a service-role client after
    // independently verifying manager elevation. auth.uid() is null under
    // service_role, so the trigger falls back to actor_type 'system' — same
    // tradeoff already documented for regenerate_event_password below.
    const eventId = await newEvent();
    expect((await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `audit-${stamp}`, p_password: "long-enough-1" })).error).toBeNull();

    const rows = await auditRows({ event_id: eventId, action: "couple_credentials_created" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_type: "system", actor_id: null, venue_id: venueId });
  });

  it("records password regeneration without a staff actor, now that it's gated through a service-role route (final review finding, same tradeoff as event deletion below)", async () => {
    // Migration 0102: regenerate_event_password is no longer callable by a
    // plain authenticated staff session at all — only via the gated
    // /api/venue/events/[eventId]/regenerate-password route, which calls it
    // with a service-role client after independently verifying manager
    // elevation. auth.uid() is null under service_role, so the trigger
    // falls back to actor_type 'system' — the audit-log-by-manager-name
    // gap (spec D7) this leaves open is a known, still-deferred item.
    const eventId = await newEvent();
    expect((await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `audit-regen-${stamp}`, p_password: "long-enough-1" })).error).toBeNull();
    expect((await admin.rpc("regenerate_event_password", { p_event_id: eventId, p_password: "long-enough-2" })).error).toBeNull();

    const rows = await auditRows({ event_id: eventId, action: "couple_password_regenerated" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_type: "system", actor_id: null, venue_id: venueId });
  });

  it("records an event deletion, without personal data", async () => {
    // Plan 2 (migration 0095): events are deleted only through the gated
    // /api/venue/events/[eventId] route, which uses the service-role
    // client after independently verifying the manager-elevation token —
    // staff's own RLS-bound client can no longer delete events directly.
    const eventId = await newEvent();
    expect((await admin.from("events").delete().eq("id", eventId)).error).toBeNull();
    const rows = await auditRows({ event_id: eventId, action: "event_deleted" });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain("Audit & Test");
  });

  it("cannot be changed or deleted by staff or even the service role", async () => {
    const eventId = await newEvent();
    await admin.from("events").delete().eq("id", eventId);
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

    await submitRsvpBySlug(slug, { fullName: "марко илиевски", status: "declined", partySize: 1 }, { ip: "203.0.113.9", requestId: "req-1" });
    await submitRsvpBySlug(slug, { fullName: "Марко Илиевски", status: "confirmed", partySize: 2 }, { ip: "198.51.100.4", requestId: "req-2" });

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
