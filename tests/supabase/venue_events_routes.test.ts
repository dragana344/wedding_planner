import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let userId: string;
let managerToken: string;
let eventId: string;
const EMAIL = `events-route-${stamp}@test.local`;
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

import { POST as createRoute } from "@/app/api/venue/events/route";
import { PATCH as updateRoute, DELETE as deleteRoute } from "@/app/api/venue/events/[eventId]/route";
import { PATCH as contactRoute } from "@/app/api/venue/events/[eventId]/contact/route";
import { PATCH as financeRoute } from "@/app/api/venue/events/[eventId]/finance/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

function req(url: string, method: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return new NextRequest(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
function ctx(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

const validCreateBody = {
  couple_names: "Тест Пар", event_date: "2027-01-01", room_ids: [], menu_template_id: null,
  contacts: { contact_email: "test@example.com", contact_phone: "070123456" },
  credentials: { username: `test-par-${Date.now()}`, password: "a-strong-password-1" },
};

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Events Route Venue ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Тест Менаџер", p_password: "manager-pass-1", p_is_owner: true })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Тест Менаџер", true)).token;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Постоечки Пар", event_date: "2027-02-01" }).select("id").single()).data!.id;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("POST /api/venue/events", () => {
  it("creates an event for an elevated manager", async () => {
    const res = await createRoute(req("/api/venue/events", "POST", validCreateBody, managerToken), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
  });

  it("refuses with no manager token", async () => {
    const res = await createRoute(req("/api/venue/events", "POST", validCreateBody), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("refuses with an invalid manager token", async () => {
    const res = await createRoute(req("/api/venue/events", "POST", validCreateBody, "0".repeat(64)), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });

  it("gives a specific message for a malformed or non-existent date, not a generic save failure (final review finding)", async () => {
    for (const badDate of ["not-a-date", "2027/01/01", "2026-02-30"]) {
      const res = await createRoute(req("/api/venue/events", "POST", { ...validCreateBody, event_date: badDate }, managerToken), { params: Promise.resolve({}) });
      expect(res.status, badDate).toBe(400);
      expect((await res.json()).error, badDate).toBe("Внесете важечки датум (ГГГГ-ММ-ДД).");
    }
  });
});

describe("PATCH/DELETE /api/venue/events/[eventId]", () => {
  it("updates an event for an elevated manager", async () => {
    const res = await updateRoute(
      req(`/api/venue/events/${eventId}`, "PATCH", {
        couple_names: "Изменет Пар", event_date: "2027-02-02", start_time: null, end_time: null,
        status: "confirmed", event_type: "wedding", guest_count_estimate: 50, room_ids: [], menu_template_id: null,
      }, managerToken),
      ctx(eventId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses an update with no manager token", async () => {
    const res = await updateRoute(
      req(`/api/venue/events/${eventId}`, "PATCH", {
        couple_names: "X", event_date: "2027-02-02", start_time: null, end_time: null,
        status: "confirmed", event_type: "wedding", guest_count_estimate: null, room_ids: [], menu_template_id: null,
      }),
      ctx(eventId),
    );
    expect(res.status).toBe(403);
  });

  it("refuses a delete with no manager token", async () => {
    const res = await deleteRoute(req(`/api/venue/events/${eventId}`, "DELETE", undefined), ctx(eventId));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/venue/events/[eventId]/contact and /finance", () => {
  it("updates contact info for an elevated manager", async () => {
    const res = await contactRoute(
      req(`/api/venue/events/${eventId}/contact`, "PATCH", { contact_email: "new@example.com", contact_phone: "070999999", contact_email_2: null }, managerToken),
      ctx(eventId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses finance update with no manager token", async () => {
    const res = await financeRoute(req(`/api/venue/events/${eventId}/finance`, "PATCH", { total_price: 1000, deposit_paid: 200 }), ctx(eventId));
    expect(res.status).toBe(403);
  });

  it("refuses a deposit greater than the total price, even for an elevated manager (final review finding: only the form checked this)", async () => {
    const res = await financeRoute(
      req(`/api/venue/events/${eventId}/finance`, "PATCH", { total_price: 1000, deposit_paid: 2000 }, managerToken),
      ctx(eventId),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Капарот не може да биде поголем од вкупната цена.");
  });
});

describe("Past events are read-only server-side (security review fix)", () => {
  let pastEventId: string;
  beforeAll(async () => {
    pastEventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Минат Пар", event_date: "2000-01-01" }).select("id").single()).data!.id;
  });
  afterAll(async () => {
    await admin.from("events").delete().eq("id", pastEventId);
  });

  it("refuses PATCH /events/[eventId] with 409, for an elevated manager", async () => {
    const res = await updateRoute(
      req(`/api/venue/events/${pastEventId}`, "PATCH", {
        couple_names: "X", event_date: "2000-01-01", start_time: null, end_time: null,
        status: "confirmed", event_type: "wedding", guest_count_estimate: null, room_ids: [], menu_template_id: null,
      }, managerToken),
      ctx(pastEventId),
    );
    expect(res.status).toBe(409);
  });

  it("still allows DELETE for a past event — deleting the whole event is a staff choice, never automatic, unlike editing it", async () => {
    const throwaway = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Избриши Ме", event_date: "2000-01-01" }).select("id").single()).data!.id;
    const res = await deleteRoute(req(`/api/venue/events/${throwaway}`, "DELETE", undefined, managerToken), ctx(throwaway));
    expect(res.status).toBe(200);
  });

  it("refuses PATCH /events/[eventId]/contact with 409", async () => {
    const res = await contactRoute(
      req(`/api/venue/events/${pastEventId}/contact`, "PATCH", { contact_email: "x@example.com", contact_phone: "070000000", contact_email_2: null }, managerToken),
      ctx(pastEventId),
    );
    expect(res.status).toBe(409);
  });

  it("refuses PATCH /events/[eventId]/finance with 409", async () => {
    const res = await financeRoute(
      req(`/api/venue/events/${pastEventId}/finance`, "PATCH", { total_price: 1000, deposit_paid: 200 }, managerToken),
      ctx(pastEventId),
    );
    expect(res.status).toBe(409);
  });
});
