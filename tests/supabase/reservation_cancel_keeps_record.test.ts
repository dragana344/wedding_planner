import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Group A task 4 (0174): "Откажи" / "Гостите заминаа" keep the reservation
// (status change, audited with the manager's name), cancelling a mini event
// cancels the event itself, and "Избриши засекогаш" is a separate, audited
// delete of an already cancelled/completed ordinary booking.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const EMAIL = `res-cancel-${stamp}@test.local`;
const PASSWORD = "staff-password-123";
let venueId: string;
let otherVenueId: string;
let userId: string;
let roomId: string;
let tableId: string;
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

import { PATCH, DELETE } from "@/app/api/venue/reservations/[reservationId]/route";
import { createManagerElevation } from "@/lib/venue/manager-elevation";
import { MANAGER_TOKEN_HEADER } from "@/lib/venue/manager-guard";

function req(id: string, method: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  return new NextRequest(`http://localhost/api/venue/reservations/${id}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const ctx = (reservationId: string) => ({ params: Promise.resolve({ reservationId }) });

let n = 0;
async function booking(opts: { date?: string; start?: string; status?: string; eventId?: string; guest?: string; venue?: string; withTable?: boolean } = {}) {
  n += 1;
  const { data, error } = await admin
    .from("reservations")
    .insert({
      venue_id: opts.venue ?? venueId, room_id: roomId, guest_name: opts.guest ?? `Гостин ${n}`, phone: "070111222",
      date: opts.date ?? "2099-03-01", start_time: opts.start ?? `${String(8 + (n % 12)).padStart(2, "0")}:00`, end_time: null,
      party_size: 4, status: opts.status ?? "reserved", event_id: opts.eventId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (opts.withTable) {
    const { error: tErr } = await admin.from("reservation_tables").insert({ reservation_id: data.id, layout_element_id: tableId });
    if (tErr) throw tErr;
  }
  return data.id as string;
}

async function auditFor(targetId: string, action: string) {
  const { data } = await admin.from("audit_log").select("*").eq("target_id", targetId).eq("action", action);
  return data ?? [];
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Res Cancel Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Res Cancel Other ${stamp}` }).select("id").single()).data!.id;
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await admin.from("venue_staff").insert({ user_id: userId, venue_id: venueId });
  const managerId = (await admin.rpc("create_venue_manager", { p_venue_id: venueId, p_name: "Тест Менаџер", p_password: "manager-pass-1", p_is_owner: true })).data as string;
  managerToken = (await createManagerElevation(venueId, managerId, "Тест Менаџер", true)).token;
  roomId = (await admin.from("rooms").insert({ venue_id: venueId, name: "Сала" }).select("id").single()).data!.id;
  tableId = (await admin.from("room_layout_elements").insert({ room_id: roomId, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 150, length_cm: 150 }).select("id").single()).data!.id;
});
afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
});

describe("PATCH /api/venue/reservations/[id]", () => {
  it("cancels without a manager login: the row stays, frees its table, and the audit row names the booking", async () => {
    const id = await booking({ guest: "Ана Откажана", date: "2099-03-02", start: "19:00", withTable: true });
    const res = await PATCH(req(id, "PATCH", { status: "cancelled" }), ctx(id));
    expect(res.status).toBe(200);
    expect((await admin.from("reservations").select("status").eq("id", id).single()).data!.status).toBe("cancelled");
    // 0035: the table is free for another booking at the same time.
    const again = await booking({ date: "2099-03-02", start: "19:00", withTable: true });
    expect(again).toBeTruthy();

    const [row] = await auditFor(id, "reservation_cancelled");
    expect(row).toMatchObject({ venue_id: venueId, actor_type: "staff", actor_id: userId, manager_name: null });
    expect(row.details).toMatchObject({ date: "2099-03-02", start_time: "19:00:00", end_time: null, party_size: 4, room_id: roomId, previous_status: "reserved", status: "cancelled" });
    // 0177: audit_log is append-only, so it never holds a name or phone.
    expect(JSON.stringify(row)).not.toContain("Ана Откажана");
    expect(JSON.stringify(row)).not.toContain("070111222");
  });

  it("'guests left' marks it completed, attributed to the elevated manager", async () => {
    const id = await booking({ status: "seated" });
    const res = await PATCH(req(id, "PATCH", { status: "completed" }, managerToken), ctx(id));
    expect(res.status).toBe(200);
    expect((await admin.from("reservations").select("status").eq("id", id).single()).data!.status).toBe("completed");
    const [row] = await auditFor(id, "reservation_completed");
    expect(row.manager_name).toBe("Тест Менаџер");
  });

  it("restores an upcoming cancelled booking, audited — but not when its table was taken meanwhile", async () => {
    const id = await booking({ status: "cancelled", date: "2099-03-03", start: "12:00", withTable: true });
    const res = await PATCH(req(id, "PATCH", { status: "reserved" }), ctx(id));
    expect(res.status).toBe(200);
    expect(await auditFor(id, "reservation_restored")).toHaveLength(1);

    const taken = await booking({ status: "cancelled", date: "2099-03-03", start: "12:30", withTable: true });
    const refused = await PATCH(req(taken, "PATCH", { status: "reserved" }), ctx(taken));
    expect(refused.status).toBe(409);
    expect((await admin.from("reservations").select("status").eq("id", taken).single()).data!.status).toBe("cancelled");
  });

  it("refuses transitions the day list doesn't offer, and another venue's reservation", async () => {
    const completed = await booking({ status: "completed" });
    expect((await PATCH(req(completed, "PATCH", { status: "reserved" }), ctx(completed))).status).toBe(400);
    const foreign = await booking({ venue: otherVenueId });
    expect((await PATCH(req(foreign, "PATCH", { status: "cancelled" }), ctx(foreign))).status).toBe(404);
    expect((await admin.from("reservations").select("status").eq("id", foreign).single()).data!.status).toBe("reserved");
  });

  it("cancelling a mini event needs a manager, then cancels the event itself (kept, 30-day couple access) and its reservation", async () => {
    const eventId = (await admin.from("events").insert({
      venue_id: venueId, couple_names: "Роденден Ива", event_date: "2099-04-01", event_type: "birthday", status: "confirmed",
      seating_mode: "mini", total_price: 500, deposit_paid: 100,
    }).select("id").single()).data!.id;
    const id = await booking({ eventId, guest: "Роденден Ива", date: "2099-04-01", start: "18:00", withTable: true });

    const noManager = await PATCH(req(id, "PATCH", { status: "cancelled" }), ctx(id));
    expect(noManager.status).toBe(403);
    expect((await admin.from("events").select("status").eq("id", eventId).single()).data!.status).toBe("confirmed");

    const res = await PATCH(req(id, "PATCH", { status: "cancelled" }, managerToken), ctx(id));
    expect(res.status).toBe(200);
    const event = (await admin.from("events").select("status, couple_access_until").eq("id", eventId).single()).data!;
    expect(event.status).toBe("cancelled");
    expect(event.couple_access_until).not.toBeNull();
    expect((await admin.from("reservations").select("status").eq("id", id).single()).data!.status).toBe("cancelled");

    const [eventRow] = await auditFor(eventId, "event_cancelled");
    expect(eventRow.manager_name).toBe("Тест Менаџер");
    expect(eventRow.details).toMatchObject({ event_type: "birthday", event_date: "2099-04-01", previous_status: "confirmed", total_price: 500, deposit_paid: 100 });
    expect(JSON.stringify(eventRow)).not.toContain("Роденден Ива");
    const [resRow] = await auditFor(id, "reservation_cancelled");
    expect(resRow).toMatchObject({ event_id: eventId, manager_name: "Тест Менаџер" });

    // Restoring a mini event happens on the event (its status), not here.
    expect((await PATCH(req(id, "PATCH", { status: "reserved" }, managerToken), ctx(id))).status).toBe(400);
  });

  it("refuses to cancel a mini event that is already in the past", async () => {
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Стар Настан", event_date: "2020-01-01", seating_mode: "mini" }).select("id").single()).data!.id;
    const id = await booking({ eventId, date: "2020-01-01" });
    const res = await PATCH(req(id, "PATCH", { status: "cancelled" }, managerToken), ctx(id));
    expect(res.status).toBe(409);
  });
});

describe("a mini event's reservation follows the event's status (0174 trigger)", () => {
  it("cancelling the event (from its own page) cancels the reservation; reverting books it again", async () => {
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Крштевка", event_date: "2099-05-01", seating_mode: "mini" }).select("id").single()).data!.id;
    const id = await booking({ eventId, date: "2099-05-01", start: "13:00", withTable: true });
    await admin.from("events").update({ status: "cancelled" }).eq("id", eventId);
    expect((await admin.from("reservations").select("status").eq("id", id).single()).data!.status).toBe("cancelled");
    await admin.from("events").update({ status: "confirmed" }).eq("id", eventId);
    const back = (await admin.from("reservations").select("status, reservation_tables(layout_element_id)").eq("id", id).single()).data!;
    expect(back.status).toBe("reserved");
    expect(back.reservation_tables).toHaveLength(1);
  });

  it("reverting still works when the table was taken meanwhile: the reservation comes back without tables", async () => {
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Матурска", event_date: "2099-05-02", seating_mode: "mini" }).select("id").single()).data!.id;
    const id = await booking({ eventId, date: "2099-05-02", start: "20:00", withTable: true });
    await admin.from("events").update({ status: "cancelled" }).eq("id", eventId);
    await booking({ date: "2099-05-02", start: "20:00", withTable: true });
    const { error } = await admin.from("events").update({ status: "confirmed" }).eq("id", eventId);
    expect(error).toBeNull();
    const back = (await admin.from("reservations").select("status, reservation_tables(layout_element_id)").eq("id", id).single()).data!;
    expect(back.status).toBe("reserved");
    expect(back.reservation_tables).toHaveLength(0);
  });
});

describe("DELETE /api/venue/reservations/[id] (Избриши засекогаш)", () => {
  it("refuses an active booking and a mini event's reservation", async () => {
    const active = await booking();
    expect((await DELETE(req(active, "DELETE", undefined), ctx(active))).status).toBe(400);
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Мини", event_date: "2099-06-01", seating_mode: "mini", status: "cancelled" }).select("id").single()).data!.id;
    const mini = await booking({ eventId, status: "cancelled" });
    expect((await DELETE(req(mini, "DELETE", undefined), ctx(mini))).status).toBe(400);
    expect((await admin.from("reservations").select("id").in("id", [active, mini])).data).toHaveLength(2);
  });

  it("removes a cancelled booking for good, with an audit row holding its date, time, size and room — never its name", async () => {
    const id = await booking({ status: "cancelled", guest: "Марко Бришење", date: "2099-07-01", start: "21:00" });
    const res = await DELETE(req(id, "DELETE", undefined, managerToken), ctx(id));
    expect(res.status).toBe(200);
    expect((await admin.from("reservations").select("id").eq("id", id)).data).toEqual([]);
    const [row] = await auditFor(id, "reservation_deleted");
    expect(row).toMatchObject({ venue_id: venueId, actor_id: userId, manager_name: "Тест Менаџер" });
    expect(row.details).toMatchObject({ date: "2099-07-01", start_time: "21:00:00", end_time: null, party_size: 4, room_id: roomId, status: "cancelled" });
    expect(JSON.stringify(row)).not.toContain("Марко Бришење");
    expect(JSON.stringify(row)).not.toContain("070111222");
  });

  it("the function itself refuses an active booking or another venue's (defence in depth)", async () => {
    const active = await booking();
    expect((await admin.rpc("delete_reservation_as_staff", { p_reservation_id: active, p_venue_id: venueId })).data).toBe(false);
    const foreign = await booking({ venue: otherVenueId, status: "cancelled" });
    expect((await admin.rpc("delete_reservation_as_staff", { p_reservation_id: foreign, p_venue_id: venueId })).data).toBe(false);
    expect((await admin.from("reservations").select("id").in("id", [active, foreign])).data).toHaveLength(2);
  });
});

describe("staff can't bypass the audited routes from the browser (0178)", () => {
  async function staffClient() {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw error;
    return c;
  }

  it("refuses a direct delete of a booking: the row stays", async () => {
    const staff = await staffClient();
    const id = await booking({ status: "cancelled" });
    const { error } = await staff.from("reservations").delete().eq("id", id);
    expect(error?.code).toBe("42501");
    expect((await admin.from("reservations").select("id").eq("id", id)).data).toHaveLength(1);
  });

  it("the booking form still cleans up after a failed table claim (createReservation, staff client)", async () => {
    const staff = await staffClient();
    const { createReservation } = await import("@/lib/venue/reservations");
    await expect(
      createReservation(
        {
          venue_id: venueId, room_id: roomId, guest_name: `Orphan ${stamp}`, phone: "070127127", date: "2099-08-01",
          start_time: "12:00", end_time: null, party_size: 2, table_ids: ["00000000-0000-0000-0000-000000000000"],
        },
        staff,
      ),
    ).rejects.toThrow();
    expect((await admin.from("reservations").select("id").eq("guest_name", `Orphan ${stamp}`)).data).toEqual([]);

    // And still books normally.
    const ok = await createReservation(
      { venue_id: venueId, room_id: roomId, guest_name: `Booked ${stamp}`, phone: "070127128", date: "2099-08-02", start_time: "12:00", end_time: null, party_size: 2, table_ids: [tableId] },
      staff,
    );
    expect(ok.table_ids).toEqual([tableId]);
  });

  it("discard_unbooked_reservation removes only a just-made, table-less ordinary booking of the caller's venue", async () => {
    const staff = await staffClient();
    const withTable = await booking({ withTable: true, date: "2099-08-03" });
    const foreign = await booking({ venue: otherVenueId });
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Мини 0178", event_date: "2099-08-04", seating_mode: "mini" }).select("id").single()).data!.id;
    const mini = await booking({ eventId, date: "2099-08-04" });
    const old = await booking();
    await admin.from("reservations").update({ created_at: "2020-01-01T00:00:00Z" }).eq("id", old);
    for (const id of [withTable, foreign, mini, old]) {
      expect((await staff.rpc("discard_unbooked_reservation", { p_reservation_id: id })).data, id).toBe(false);
    }
    expect((await admin.from("reservations").select("id").in("id", [withTable, foreign, mini, old])).data).toHaveLength(4);
    const fresh = await booking();
    expect((await staff.rpc("discard_unbooked_reservation", { p_reservation_id: fresh })).data).toBe(true);
    expect((await admin.from("reservations").select("id").eq("id", fresh)).data).toEqual([]);
  });

  it("a mini event's reservation can't be cancelled or restored apart from its event, nor moved to another event", async () => {
    const staff = await staffClient();
    const eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Роденден 0178", event_date: "2099-08-05", seating_mode: "mini" }).select("id").single()).data!.id;
    const otherEvent = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Друг 0178", event_date: "2099-08-06" }).select("id").single()).data!.id;
    const id = await booking({ eventId, date: "2099-08-05", withTable: true });

    expect((await staff.from("reservations").update({ status: "cancelled" }).eq("id", id)).error?.code).toBe("42501");
    expect((await admin.from("reservations").update({ status: "cancelled" }).eq("id", id)).error?.code).toBe("42501");
    expect((await staff.from("reservations").update({ event_id: otherEvent }).eq("id", id)).error?.code).toBe("42501");
    expect((await admin.from("reservations").select("status, event_id").eq("id", id).single()).data).toEqual({ status: "reserved", event_id: eventId });

    // The day list's own steps stay free.
    expect((await staff.from("reservations").update({ status: "seated" }).eq("id", id)).error).toBeNull();

    // Through the event it follows; restoring it alone while the event is cancelled is refused.
    await admin.from("events").update({ status: "cancelled" }).eq("id", eventId);
    expect((await admin.from("reservations").select("status").eq("id", id).single()).data!.status).toBe("cancelled");
    expect((await staff.from("reservations").update({ status: "reserved" }).eq("id", id)).error?.code).toBe("42501");
    await admin.from("events").update({ status: "confirmed" }).eq("id", eventId);
    expect((await admin.from("reservations").select("status").eq("id", id).single()).data!.status).toBe("reserved");
  });
});

describe("event_deleted audit (0174, 0177)", () => {
  it("keeps the type, date and the venue's money, never the couple names", async () => {
    const eventId = (await admin.from("events").insert({
      venue_id: venueId, couple_names: "Пар За Бришење", event_date: "2099-08-01", event_type: "wedding", total_price: 9000, deposit_paid: 1500,
    }).select("id").single()).data!.id;
    await admin.rpc("delete_event_as_manager", { p_event_id: eventId, p_venue_id: venueId, p_manager_name: "Тест Менаџер" });
    const [row] = await auditFor(eventId, "event_deleted");
    expect(row.manager_name).toBe("Тест Менаџер");
    expect(row.details).toMatchObject({ event_type: "wedding", event_date: "2099-08-01", total_price: 9000, deposit_paid: 1500 });
    expect(JSON.stringify(row)).not.toContain("Пар За Бришење");
  });

  it("keeps only date, type and status when the whole venue account is deleted", async () => {
    const gone = (await admin.from("venues").insert({ name: `Res Cancel Gone ${stamp}` }).select("id").single()).data!.id;
    const eventId = (await admin.from("events").insert({ venue_id: gone, couple_names: "Пар Со Салата", event_date: "2099-08-02" }).select("id").single()).data!.id;
    await admin.from("venues").delete().eq("id", gone);
    const [row] = await auditFor(eventId, "event_deleted");
    expect(Object.keys(row.details).sort()).toEqual(["event_date", "event_type", "status"]);
    expect(JSON.stringify(row)).not.toContain("Пар Со Салата");
  });
});
