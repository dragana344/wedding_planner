import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Project A §5: the HTTP layer over lib/seating/proposals.ts — manager
// elevation on the venue's send/approve/reject, no elevation on the
// couple's, and the venue's "send" snapshotting the room's current live
// layout. lib/seating/proposals.ts's own behaviour (approve/reject/
// supersede semantics) is already covered by tests/lib/couple/seating.test.ts
// and tests/supabase/review_fixes_s3.test.ts; this file is the routes only.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `proposals-route-${stamp}@test.local`;
const PASSWORD = "staff-password-123";

let venueId: string;
let userId: string;
let roomId: string;
let tableTypeId: string;
let eventId: string;
let managerToken: string;

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

import { GET as proposalsGet, POST as proposalsPost } from "@/app/api/venue/events/[eventId]/seating/proposals/route";
import { POST as coupleProposalsPost } from "@/app/api/couple/seating/proposals/route";
import { POST as coupleResetBaseline } from "@/app/api/couple/seating/reset-baseline/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";
import { COUPLE_EVENT_HEADER } from "@/lib/api/handler";

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

function venueGet(query: Record<string, string>, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  const qs = new URLSearchParams(query);
  return proposalsGet(new NextRequest(`http://localhost/api/venue/events/${eventId}/seating/proposals?${qs}`, { headers }), {
    params: Promise.resolve({ eventId }),
  });
}

function venuePost(body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return proposalsPost(
    new NextRequest(`http://localhost/api/venue/events/${eventId}/seating/proposals`, { method: "POST", headers, body: JSON.stringify(body) }),
    { params: Promise.resolve({ eventId }) },
  );
}

function couplePost(handler: typeof coupleProposalsPost, body: unknown) {
  const headers = { "content-type": "application/json", [COUPLE_EVENT_HEADER]: eventId };
  return handler(new NextRequest("http://localhost/api/couple/test", { method: "POST", headers, body: JSON.stringify(body) }), {
    params: Promise.resolve({}),
  });
}

async function liveElements() {
  return must(admin.from("event_layout_elements").select("id, table_type_id").eq("event_id", eventId).eq("room_id", roomId));
}

beforeAll(async () => {
  venueId = (await must(admin.from("venues").insert({ name: `Proposals Route ${stamp}` }).select("id").single())).id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await must(admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId }).select("user_id"));

  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single())).id;
  tableTypeId = (await must(
    admin.from("table_types").insert({ room_id: roomId, name: "R8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 9 }).select("id").single(),
  )).id;
  await must(admin.from("room_layout_elements").insert([
    { room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 100, y_cm: 100, width_cm: 150, length_cm: 150 },
  ]));

  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Менаџер", p_password: "manager-pass-1", p_is_owner: true })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Менаџер", true)).token;
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("venue seating proposals route", () => {
  it("lists without elevation, but refuses send/approve/reject for plain staff", async () => {
    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 1", event_date: "2027-09-01" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));

    expect((await venueGet({ room_id: roomId })).status).toBe(200);
    expect((await venuePost({ op: "send", room_id: roomId })).status).toBe(403);
  });

  it("sends the room's current live layout as a venue proposal, created_by the manager", async () => {
    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 2", event_date: "2027-09-02" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    await must(admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }).select("id"));

    const res = await venuePost({ op: "send", room_id: roomId }, managerToken);
    expect(res.status).toBe(200);
    const proposal = await res.json();
    expect(proposal).toMatchObject({ proposed_by: "venue", status: "pending", created_by: "Менаџер" });

    const list = await (await venueGet({ room_id: roomId })).json();
    expect(list).toHaveLength(1);
  });

  it("approves a couple-sent proposal, applying it to the live layout, and supersedes other pending ones", async () => {
    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 3", event_date: "2027-09-03" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    const tableId = "9b1e2c3d-0000-4000-8000-000000000001";
    const { data: couple } = await admin
      .from("event_seating_proposals")
      .insert({ event_id: eventId, room_id: roomId, proposed_by: "couple", snapshot: { elements: [{ id: tableId, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" }] } })
      .select("id")
      .single();
    const { data: stalePending } = await admin
      .from("event_seating_proposals")
      .insert({ event_id: eventId, room_id: roomId, proposed_by: "venue", snapshot: { elements: [] } })
      .select("id")
      .single();

    const res = await venuePost({ op: "approve", proposal_id: couple!.id }, managerToken);
    expect(res.status).toBe(200);
    expect(await liveElements()).toEqual([{ id: tableId, table_type_id: tableTypeId }]);

    const { data: stale } = await admin.from("event_seating_proposals").select("status").eq("id", stalePending!.id).single();
    expect(stale!.status).toBe("superseded");
  });

  it("rejects a proposal with a note, and refuses answering it twice", async () => {
    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 4", event_date: "2027-09-04" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    const { data: couple } = await admin
      .from("event_seating_proposals")
      .insert({ event_id: eventId, room_id: roomId, proposed_by: "couple", snapshot: { elements: [] } })
      .select("id")
      .single();

    const res = await venuePost({ op: "reject", proposal_id: couple!.id, note: "Премногу маси" }, managerToken);
    expect(res.status).toBe(200);
    const rejected = await res.json();
    expect(rejected).toMatchObject({ status: "rejected", note: "Премногу маси", responded_by: "Менаџер" });

    expect((await venuePost({ op: "approve", proposal_id: couple!.id }, managerToken)).status).toBe(409);
  });

  it("rejecting a venue-sent proposal restores the room's live layout to the last resolved state, not just the edit", async () => {
    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 4б", event_date: "2027-09-04" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    const tableA = "9b1e2c3d-0000-4000-8000-0000000000a1";
    const tableB = "9b1e2c3d-0000-4000-8000-0000000000a2";
    const elA = { id: tableA, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" };
    const elB = { id: tableB, element_type: "table", table_type_id: tableTypeId, x_cm: 200, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" };

    // An earlier venue-sent proposal, already approved — this is the "last
    // agreed state" a later rejection should fall back to.
    await must(admin.from("event_seating_proposals").insert({
      event_id: eventId, room_id: roomId, proposed_by: "venue", status: "approved",
      snapshot: { elements: [elA] }, responded_at: "2027-01-01T00:00:00.000Z",
    }).select("id"));

    // Staff then adds a second table live (venue edits are always live) and sends it.
    await must(admin.from("event_layout_elements").insert([
      { event_id: eventId, room_id: roomId, ...elA },
      { event_id: eventId, room_id: roomId, ...elB },
    ]));
    const sendRes = await venuePost({ op: "send", room_id: roomId }, managerToken);
    const sent = await sendRes.json();
    expect(await liveElements()).toHaveLength(2);

    const res = await couplePost(coupleProposalsPost, { proposal_id: sent.id, action: "reject", note: "Не одговара" });
    expect(res.status).toBe(200);

    // Rejecting the venue's proposal must undo the live edit it carried, not
    // just record a "rejected" status while table B stays live.
    expect(await liveElements()).toEqual([{ id: tableA, table_type_id: tableTypeId }]);
  });

  it("rejecting a venue-sent proposal falls back to the event's frozen baseline when nothing was resolved before it", async () => {
    const tableBase = "9b1e2c3d-0000-4000-8000-0000000000b1";
    const tableExtra = "9b1e2c3d-0000-4000-8000-0000000000b2";
    eventId = (await must(admin.from("events").insert({
      venue_id: venueId, couple_names: "Пар 4в", event_date: "2027-09-04",
      seating_baseline: { [roomId]: [{ id: tableBase, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" }] },
    }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));

    await must(admin.from("event_layout_elements").insert([
      { event_id: eventId, room_id: roomId, id: tableBase, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 },
      { event_id: eventId, room_id: roomId, id: tableExtra, element_type: "table", table_type_id: tableTypeId, x_cm: 200, y_cm: 0, width_cm: 150, length_cm: 150 },
    ]));
    const sent = await (await venuePost({ op: "send", room_id: roomId }, managerToken)).json();

    const res = await couplePost(coupleProposalsPost, { proposal_id: sent.id, action: "reject" });
    expect(res.status).toBe(200);
    expect(await liveElements()).toEqual([{ id: tableBase, table_type_id: tableTypeId }]);
  });

  it("rejecting a second, unrelated offer does not resurrect an earlier rejected one (bug fix)", async () => {
    const tableBase = "9b1e2c3d-0000-4000-8000-0000000000e1";
    const tableA = "9b1e2c3d-0000-4000-8000-0000000000e2";
    const tableB = "9b1e2c3d-0000-4000-8000-0000000000e3";
    eventId = (await must(admin.from("events").insert({
      venue_id: venueId, couple_names: "Пар 4е", event_date: "2027-09-04",
      seating_baseline: { [roomId]: [{ id: tableBase, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" }] },
    }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    await must(admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, id: tableBase, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }));

    // Round A: venue adds a table, offers it, couple rejects — live goes back to just tableBase.
    await must(admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, id: tableA, element_type: "table", table_type_id: tableTypeId, x_cm: 200, y_cm: 0, width_cm: 150, length_cm: 150 }));
    const sentA = await (await venuePost({ op: "send", room_id: roomId }, managerToken)).json();
    await couplePost(coupleProposalsPost, { proposal_id: sentA.id, action: "reject" });
    expect(await liveElements()).toEqual([{ id: tableBase, table_type_id: tableTypeId }]);

    // Round B: a different table, offered and rejected too — should still
    // land back on just tableBase, not resurrect tableA from round A.
    await must(admin.from("event_layout_elements").insert({ event_id: eventId, room_id: roomId, id: tableB, element_type: "table", table_type_id: tableTypeId, x_cm: 400, y_cm: 0, width_cm: 150, length_cm: 150 }));
    const sentB = await (await venuePost({ op: "send", room_id: roomId }, managerToken)).json();
    await couplePost(coupleProposalsPost, { proposal_id: sentB.id, action: "reject" });
    expect(await liveElements()).toEqual([{ id: tableBase, table_type_id: tableTypeId }]);
  });

  it("GET with proposal_id (fix #3) diffs against the last resolved state, falling back to the baseline when there is none", async () => {
    const tableBase = "9b1e2c3d-0000-4000-8000-0000000000c1";
    const tableExtra = "9b1e2c3d-0000-4000-8000-0000000000c2";
    eventId = (await must(admin.from("events").insert({
      venue_id: venueId, couple_names: "Пар 4г", event_date: "2027-09-04",
      seating_baseline: { [roomId]: [{ id: tableBase, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" }] },
    }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    await must(admin.from("event_layout_elements").insert([
      { event_id: eventId, room_id: roomId, id: tableBase, element_type: "table", table_type_id: tableTypeId, x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 },
      { event_id: eventId, room_id: roomId, id: tableExtra, element_type: "table", table_type_id: tableTypeId, x_cm: 200, y_cm: 0, width_cm: 150, length_cm: 150 },
    ]));
    const sent = await (await venuePost({ op: "send", room_id: roomId }, managerToken)).json();

    // The GET itself needs no elevation — same as the plain room_id list (staff may view).
    const diff = await (await venueGet({ proposal_id: sent.id })).json();
    expect(diff.before.map((e: { id: string }) => e.id)).toEqual([tableBase]);
    expect(diff.after.map((e: { id: string }) => e.id).sort()).toEqual([tableBase, tableExtra].sort());

    // Resolve it, then send a second one: the diff should now compare
    // against that resolved state, not the baseline any more.
    await venuePost({ op: "approve", proposal_id: sent.id }, managerToken);
    await must(admin.from("event_layout_elements").delete().eq("id", tableExtra));
    const sent2 = await (await venuePost({ op: "send", room_id: roomId }, managerToken)).json();
    const diff2 = await (await venueGet({ proposal_id: sent2.id })).json();
    expect(diff2.before.map((e: { id: string }) => e.id).sort()).toEqual([tableBase, tableExtra].sort());
    expect(diff2.after.map((e: { id: string }) => e.id)).toEqual([tableBase]);
  });

  it("GET with proposal_id refuses a foreign event's proposal", async () => {
    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 4д", event_date: "2027-09-04" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    const otherEventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Друг пар", event_date: "2027-09-04" }).select("id").single())).id;
    const { data: foreign } = await admin
      .from("event_seating_proposals")
      .insert({ event_id: otherEventId, room_id: roomId, proposed_by: "venue", snapshot: { elements: [] } })
      .select("id")
      .single();
    expect((await venueGet({ proposal_id: foreign!.id })).status).toBe(404);
    await admin.from("events").delete().eq("id", otherEventId);
  });
});

describe("couple seating proposals route", () => {
  it("approves a venue-sent proposal, syncing the couple's own draft", async () => {
    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 5", event_date: "2027-09-05" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
    const tableId = "9b1e2c3d-0000-4000-8000-000000000002";
    const { data: venueProposal } = await admin
      .from("event_seating_proposals")
      .insert({ event_id: eventId, room_id: roomId, proposed_by: "venue", snapshot: { elements: [{ id: tableId, element_type: "table", table_type_id: tableTypeId, x_cm: 10, y_cm: 10, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" }] } })
      .select("id")
      .single();

    const res = await couplePost(coupleProposalsPost, { proposal_id: venueProposal!.id, action: "approve" });
    expect(res.status).toBe(200);

    const { data: event } = await admin.from("events").select("seating_draft").eq("id", eventId).single();
    expect((event!.seating_draft as Record<string, { id: string }[]>)[roomId]).toEqual([expect.objectContaining({ id: tableId })]);
  });

  it("refuses answering a proposal from a different event", async () => {
    const otherEventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Туѓ пар", event_date: "2027-09-06" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: otherEventId, room_id: roomId }));
    const { data: foreign } = await admin
      .from("event_seating_proposals")
      .insert({ event_id: otherEventId, room_id: roomId, proposed_by: "venue", snapshot: { elements: [] } })
      .select("id")
      .single();

    eventId = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Пар 6", event_date: "2027-09-07" }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));

    const res = await couplePost(coupleProposalsPost, { proposal_id: foreign!.id, action: "approve" });
    expect(res.status).toBe(400);
  });
});

describe("couple reset-to-baseline route", () => {
  it("copies the event's frozen baseline into the draft with fresh element ids", async () => {
    eventId = (await must(admin.from("events").insert({
      venue_id: venueId, couple_names: "Пар 7", event_date: "2027-09-08",
      seating_baseline: { [roomId]: [{ id: "9b1e2c3d-0000-4000-8000-000000000003", element_type: "table", table_type_id: tableTypeId, x_cm: 5, y_cm: 5, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, group_id: null, table_role: "guest" }] },
    }).select("id").single())).id;
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));

    const res = await coupleResetBaseline(
      new NextRequest("http://localhost/api/couple/test", {
        method: "POST",
        headers: { "content-type": "application/json", [COUPLE_EVENT_HEADER]: eventId },
        body: JSON.stringify({ room_id: roomId }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const restored = await res.json();
    expect(restored).toHaveLength(1);
    expect(restored[0].x_cm).toBe(5);
    expect(restored[0].id).not.toBe("9b1e2c3d-0000-4000-8000-000000000003");
  });
});
