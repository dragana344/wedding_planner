import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let userId: string;
let managerToken: string;
let eventId: string;
let otherVenueEventId: string;
const EMAIL = `regen-pass-route-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

vi.mock("@/lib/supabase/server", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  return {
    createServerSupabaseClient: async () => {
      const c = create(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      return c;
    },
  };
});

import { POST as regenerateRoute } from "@/app/api/venue/events/[eventId]/regenerate-password/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { createEventCredentials } from "@/lib/venue/credentials";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

function req(eventId: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return new NextRequest(`http://localhost/api/venue/events/${eventId}/regenerate-password`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
function ctx(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Regen Pass Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Regen Pass Other Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Тест Менаџер", p_password: "manager-pass-1", p_is_owner: true })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Тест Менаџер", true)).token;

  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Постоечки Пар", event_date: "2027-02-01" }).select("id").single()).data!.id;
  await createEventCredentials(eventId, "postoechki-par", "original-password-1", admin);

  otherVenueEventId = (await admin.from("events").insert({ venue_id: otherVenueId, couple_names: "Друг Пар", event_date: "2027-02-01" }).select("id").single()).data!.id;
  await createEventCredentials(otherVenueEventId, "drug-par", "original-password-2", admin);
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("venues").delete().eq("id", otherVenueId);
});

describe("POST /api/venue/events/[eventId]/regenerate-password", () => {
  it("refuses with no manager token (final review finding: this RPC used to be callable by any staff session directly)", async () => {
    const res = await regenerateRoute(req(eventId, { password: "fresh-password-1" }), ctx(eventId));
    expect(res.status).toBe(403);
  });

  it("refuses a plain authenticated call to the underlying RPC now that the direct grant is revoked (migration 0102)", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    const { error } = await anon.rpc("regenerate_event_password", { p_event_id: eventId, p_password: "direct-rpc-password-1" });
    expect(error).not.toBeNull();
  });

  it("refuses an elevated manager from a different venue regenerating another venue's event password", async () => {
    const res = await regenerateRoute(req(otherVenueEventId, { password: "cross-venue-password-1" }), ctx(otherVenueEventId), );
    // No token at all would 403 regardless; this exercises that a *valid*
    // token for this venue can't reach an eventId belonging to another one
    // (service-role bypasses RLS, so the route itself must check venue_id).
    const resWithToken = await regenerateRoute(req(otherVenueEventId, { password: "cross-venue-password-1" }, managerToken), ctx(otherVenueEventId));
    expect(res.status).toBe(403);
    expect(resWithToken.status).toBe(404);
  });

  it("regenerates the password for an elevated manager", async () => {
    const res = await regenerateRoute(req(eventId, { password: "fresh-password-1" }), ctx(eventId));
    expect(res.status).toBe(403); // sanity: no token
    const ok = await regenerateRoute(req(eventId, { password: "fresh-password-1" }, managerToken), ctx(eventId));
    expect(ok.status).toBe(200);
    const verify = await admin.rpc("verify_event_credentials", { p_username: "postoechki-par", p_password: "fresh-password-1" });
    expect(verify.data?.[0]?.event_id).toBe(eventId);
  });
});
