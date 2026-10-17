import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Plan 4 of venue-manager-staff-login (migration 0104 + the seating route):
// plain staff may view an event's seating but never change it — directly
// through RLS or through the route without a manager elevation — and the
// route's service-role writes never reach another venue's event.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const stamp = Date.now();
const EMAIL = `seating-route-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

let venueId: string;
let otherVenueId: string;
let userId: string;
let roomId: string;
let unlinkedRoomId: string;
let tableTypeId: string;
let otherTableTypeId: string;
let eventId: string;
let otherEventId: string;
let otherElementId: string;
let managerToken: string;
let staffClient: SupabaseClient;

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

import { POST as seatingRoute } from "@/app/api/venue/events/[eventId]/seating/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

function call(body: unknown, token?: string, forEvent = eventId) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return seatingRoute(
    new NextRequest(`http://localhost/api/venue/events/${forEvent}/seating`, { method: "POST", headers, body: JSON.stringify(body) }),
    { params: Promise.resolve({ eventId: forEvent }) },
  );
}

async function elements(): Promise<{ id: string; x_cm: number; group_id: string | null }[]> {
  return must(admin.from("event_layout_elements").select("id, x_cm, group_id").eq("event_id", eventId).eq("room_id", roomId).order("created_at"));
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: `Seating Route ${stamp}` }).select("id").single())).id;
  otherVenueId = (await must(admin.from("venues").insert({ name: `Seating Route Other ${stamp}` }).select("id").single())).id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await must(admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId }).select("user_id"));

  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single())).id;
  unlinkedRoomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Друга сала" }).select("id").single())).id;
  tableTypeId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "R8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 9 }).select("id").single(),
  )).id;
  otherTableTypeId = (await must(
    admin.from("table_types").insert({ room_id: unlinkedRoomId, name: "R4", shape: "round", seats: 4, width_cm: 100, length_cm: 100, quantity: 9 }).select("id").single(),
  )).id;
  await must(admin.from("room_layout_elements").insert([
    { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 100, y_cm: 100, width_cm: 150, length_cm: 150 },
    { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 400, y_cm: 100, width_cm: 150, length_cm: 150 },
  ]).select("id"));
  eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар", event_date: "2027-05-01" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }).select("event_id"));

  const otherRoomId = (await must(admin.from("rooms").insert({ venue_id: otherVenueId, name: "Туѓа сала" }).select("id").single())).id;
  otherEventId = (await must(admin.from("events").insert({ venue_id: otherVenueId, couple_names: "Туѓ пар", event_date: "2027-05-01" }).select("id").single())).id;
  await must(admin.from("event_rooms").insert({ event_id: otherEventId, room_id: otherRoomId }).select("event_id"));
  otherElementId = (await must(
    admin.from("event_layout_elements").insert({ event_id: otherEventId, room_id: otherRoomId, element_type: "stage", x_cm: 10, y_cm: 10, width_cm: 100, length_cm: 100 }).select("id").single(),
  )).id;

  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-1", p_is_owner: true })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", true)).token;

  staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
  await staffClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("seating route — viewing needs no manager", () => {
  it("lets plain staff initialize a never-opened room from the standard layout", async () => {
    const res = await call({ op: "initialize", room_id: roomId });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
    expect(await elements()).toHaveLength(2);
  });

  it("does not copy the standard layout twice", async () => {
    await call({ op: "initialize", room_id: roomId });
    expect(await elements()).toHaveLength(2);
  });
});

describe("seating route — edits need a manager", () => {
  it("refuses a move with no manager token, and with an invalid one", async () => {
    const [table] = await elements();
    const move = { op: "update", element_id: table.id, change: { type: "position", x_cm: 900, y_cm: 900 } };
    expect((await call(move)).status).toBe(403);
    expect((await call(move, "0".repeat(64))).status).toBe(403);
    expect((await elements())[0].x_cm).toBe(table.x_cm);
  });

  it("moves, adds, groups, undoes and deletes for an elevated manager", async () => {
    const [t1, t2] = await elements();
    expect((await call({ op: "update", element_id: t1.id, change: { type: "position", x_cm: 700, y_cm: 700 } }, managerToken)).status).toBe(200);
    expect((await elements()).find((e) => e.id === t1.id)!.x_cm).toBe(700);

    const added = await call(
      { op: "add", element: { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 50, y_cm: 600, width_cm: 150, length_cm: 150, table_role: "guest" } },
      managerToken,
    );
    expect(added.status).toBe(200);
    const addedId = (await added.json()).id as string;

    const grouped = await call({ op: "group", room_id: roomId, element_ids: [t1.id, t2.id] }, managerToken);
    expect(grouped.status).toBe(200);
    expect(new Set((await elements()).filter((e) => e.id !== addedId).map((e) => e.group_id)).size).toBe(1);

    expect((await call({ op: "undo", room_id: roomId }, managerToken)).status).toBe(200);
    expect((await elements()).every((e) => e.group_id === null)).toBe(true);

    expect((await call({ op: "delete", element_id: addedId }, managerToken)).status).toBe(200);
    expect((await elements()).map((e) => e.id)).not.toContain(addedId);
  });

  it("explains an empty redo instead of failing silently", async () => {
    const res = await call({ op: "redo", room_id: roomId }, managerToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Нема што да се повтори.");
  });
});

describe("seating route — never reaches past the caller's venue", () => {
  it("404s an element of another venue's event", async () => {
    const res = await call({ op: "delete", element_id: otherElementId }, managerToken);
    expect(res.status).toBe(404);
    expect(await must(admin.from("event_layout_elements").select("id").eq("id", otherElementId))).toHaveLength(1);
  });

  it("404s another venue's event addressed directly", async () => {
    const res = await call({ op: "revert", room_id: roomId }, managerToken, otherEventId);
    expect(res.status).toBe(404);
  });

  it("404s a room that isn't on the event", async () => {
    expect((await call({ op: "initialize", room_id: unlinkedRoomId })).status).toBe(404);
  });

  it("404s a table type from a different room", async () => {
    const res = await call(
      { op: "add", element: { room_id: roomId, element_type: "table", table_type_id: otherTableTypeId, x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 } },
      managerToken,
    );
    expect(res.status).toBe(404);
  });
});

describe("0104 — plain staff are read-only on event seating through RLS", () => {
  it("can still read the layout, its seats and its undo history", async () => {
    expect(await must(staffClient.from("event_layout_elements").select("id").eq("event_id", eventId))).toHaveLength(2);
    const { error: seatsError } = await staffClient.from("event_seat_assignments").select("id").eq("event_id", eventId);
    expect(seatsError).toBeNull();
    const { error: historyError } = await staffClient.from("events").select("layout_history").eq("id", eventId).single();
    expect(historyError).toBeNull();
  });

  it("refuses direct inserts, updates and deletes of layout elements", async () => {
    const [table] = await elements();
    const { error: insertError } = await staffClient
      .from("event_layout_elements")
      .insert({ event_id: eventId, room_id: roomId, element_type: "stage", x_cm: 0, y_cm: 0, width_cm: 10, length_cm: 10 });
    expect(insertError).not.toBeNull();
    const { error: updateError } = await staffClient.from("event_layout_elements").update({ x_cm: 1 }).eq("id", table.id);
    expect(updateError).not.toBeNull();
    await staffClient.from("event_layout_elements").delete().eq("id", table.id);
    expect(await elements()).toHaveLength(2);
  });

  it("refuses direct seat-assignment writes", async () => {
    const [table] = await elements();
    const { error } = await staffClient
      .from("event_seat_assignments")
      .insert({ event_id: eventId, room_id: roomId, layout_element_id: table.id, seat_number: 1, guest_name: "Уфрлен" });
    expect(error).not.toBeNull();
  });

  it("refuses rewriting the undo history, but still marks seating as seen", async () => {
    const { error: historyError } = await staffClient.from("events").update({ layout_history: {} }).eq("id", eventId);
    expect(historyError).not.toBeNull();
    const { error: seenError } = await staffClient.from("events").update({ seating_unseen_at: null }).eq("id", eventId);
    expect(seenError).toBeNull();
  });

  it("refuses the staff layout RPCs", async () => {
    const { error: restoreError } = await staffClient.rpc("restore_staff_layout", { p_event_id: eventId, p_room_id: roomId, p_elements: [], p_seats: [] });
    expect(restoreError).not.toBeNull();
    const { error: pruneError } = await staffClient.rpc("prune_event_seat_assignments", { p_event_id: eventId });
    expect(pruneError).not.toBeNull();
    expect(await elements()).toHaveLength(2);
  });
});

describe("seating route — past events are read-only server-side (security review fix)", () => {
  let pastEventId: string;
  beforeAll(async () => {
    pastEventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Минат Пар", event_date: "2000-01-01" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: pastEventId, room_id: roomId }).select("event_id"));
  });
  afterAll(async () => {
    await admin.from("events").delete().eq("id", pastEventId);
  });

  it("still lets initialize copy the standard layout, so a past event's seating stays viewable", async () => {
    const res = await call({ op: "initialize", room_id: roomId }, undefined, pastEventId);
    expect(res.status).toBe(200);
  });

  it("refuses add/revert/undo/group with 409, even for an elevated manager", async () => {
    const addRes = await call({ op: "add", element: { room_id: roomId, element_type: "stage", x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100 } }, managerToken, pastEventId);
    expect(addRes.status).toBe(409);

    const revertRes = await call({ op: "revert", room_id: roomId }, managerToken, pastEventId);
    expect(revertRes.status).toBe(409);

    const undoRes = await call({ op: "undo", room_id: roomId }, managerToken, pastEventId);
    expect(undoRes.status).toBe(409);
  });
});
