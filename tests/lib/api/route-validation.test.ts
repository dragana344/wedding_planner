// @vitest-environment node
//
// Route-level input validation (SEC-004). Every rejection here must happen
// before any database access: the service-role client factory is mocked to
// throw, and the domain modules that would touch the DB are spies.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const dbAccess = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    dbAccess();
    throw new Error("DB access in a validation test");
  },
}));

const seating = vi.hoisted(() => ({
  addElement: vi.fn(async (input: Record<string, unknown>) => ({ id: "new", ...input })),
  moveElement: vi.fn(async () => ({})),
  confirm: vi.fn(async () => undefined),
}));
vi.mock("@/lib/couple/seating", () => ({ coupleSeatingActionsFor: () => seating }));

const menu = vi.hoisted(() => ({
  setMenuItemQuantities: vi.fn(async () => undefined),
  setEventMenuSelection: vi.fn(async () => undefined),
  getMenuItemQuantities: vi.fn(async () => []),
}));
vi.mock("@/lib/couple/menu", () => menu);

const guests = vi.hoisted(() => ({
  listGuests: vi.fn(),
  getGuestStats: vi.fn(),
  addGuest: vi.fn(async (_eventId: string, input: unknown) => input),
  updateGuest: vi.fn(async (_e: string, _id: string, input: unknown) => input),
  updateGuestStatus: vi.fn(async () => ({})),
  updateGuestSide: vi.fn(async () => ({})),
  deleteGuest: vi.fn(async () => undefined),
}));
vi.mock("@/lib/couple/guests", () => guests);

const rsvp = vi.hoisted(() => ({ submitRsvpBySlug: vi.fn(async () => undefined) }));
vi.mock("@/lib/couple/rsvp", () => rsvp);

const contact = vi.hoisted(() => ({ submitContactMessage: vi.fn(async () => undefined) }));
vi.mock("@/lib/venue/contact", () => contact);

import * as quantitiesRoute from "@/app/api/couple/menu/quantities/route";
import * as menuRoute from "@/app/api/couple/menu/route";
import * as elementsRoute from "@/app/api/couple/seating/elements/route";
import * as elementRoute from "@/app/api/couple/seating/elements/[id]/route";
import * as confirmRoute from "@/app/api/couple/seating/confirm/route";
import * as guestsRoute from "@/app/api/couple/guests/route";
import * as guestRoute from "@/app/api/couple/guests/[id]/route";
import * as agendaItemRoute from "@/app/api/couple/agenda/[id]/route";
import * as notesRoute from "@/app/api/couple/notes/route";
import * as guestCountRoute from "@/app/api/couple/guest-count/route";
import * as rsvpRoute from "@/app/api/invite/[slug]/rsvp/route";
import * as contactRoute from "@/app/api/venue/contact/route";

const EVENT = "11111111-1111-4111-8111-111111111111";
const ID = "3f2b8c1e-9a4d-4c2e-8f1a-2b3c4d5e6f70";
const ID2 = "00000000-0000-0000-0000-000000000002";
const INJECTION = "x),menu_item_id.not.is.null";

function req(method: string, body?: unknown, opts: { path?: string; couple?: boolean } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.couple !== false) headers.set("x-couple-event-id", EVENT);
  return new NextRequest(`http://localhost${opts.path ?? "/api/test"}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(
  handler: (r: NextRequest, c: { params: never }) => Promise<Response>,
  request: NextRequest,
  params: Record<string, string> = {},
) {
  const res = await handler(request, { params: params as never });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/couple/menu/quantities", () => {
  it("rejects a PostgREST-injection id with 400 before the lib is called", async () => {
    const res = await call(
      quantitiesRoute.PATCH,
      req("PATCH", { quantities: [{ menu_item_id: INJECTION, guest_count: 5 }] }),
    );
    expect(res).toEqual({ status: 400, body: { error: "Неважечки податоци." } });
    expect(menu.setMenuItemQuantities).not.toHaveBeenCalled();
    expect(dbAccess).not.toHaveBeenCalled();
  });

  it("passes a valid body through unchanged", async () => {
    const res = await call(
      quantitiesRoute.PATCH,
      req("PATCH", { quantities: [{ menu_item_id: ID, guest_count: 5 }, { menu_item_id: ID2, guest_count: null }] }),
    );
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(menu.setMenuItemQuantities).toHaveBeenCalledWith(EVENT, [
      { menu_item_id: ID, guest_count: 5 },
      { menu_item_id: ID2, guest_count: null },
    ]);
  });
});

describe("PATCH /api/couple/menu", () => {
  it("rejects a non-UUID custom item id", async () => {
    const res = await call(menuRoute.PATCH, req("PATCH", { mode: "custom", menu_item_ids: [ID, INJECTION] }));
    expect(res.status).toBe(400);
    expect(menu.setEventMenuSelection).not.toHaveBeenCalled();
  });

  it("keeps the unknown-mode message", async () => {
    expect(await call(menuRoute.PATCH, req("PATCH", { mode: "surprise" }))).toEqual({
      status: 400,
      body: { error: "Непознат режим на избор." },
    });
  });
});

describe("POST /api/couple/seating/elements", () => {
  it("whitelists fields and forces event_id from the session", async () => {
    const res = await call(
      elementsRoute.POST,
      req("POST", {
        event_id: "attacker-event",
        room_id: ID,
        element_type: "stage",
        x_cm: 10,
        y_cm: 20,
        width_cm: 200,
        length_cm: 150,
        rotation_deg: 90,
        id: ID2,
        extra: "dropped",
      }),
    );
    expect(res.status).toBe(200);
    expect(seating.addElement).toHaveBeenCalledTimes(1);
    const input = seating.addElement.mock.calls[0][0];
    expect(input.event_id).toBe(EVENT);
    expect(input).not.toHaveProperty("rotation_deg");
    expect(input).not.toHaveProperty("id");
    expect(input).not.toHaveProperty("extra");
  });

  it("rejects a bad element_type / room id", async () => {
    const base = { room_id: ID, element_type: "table", x_cm: 0, y_cm: 0, width_cm: 1, length_cm: 1 };
    expect((await call(elementsRoute.POST, req("POST", { ...base, element_type: "wall" }))).status).toBe(400);
    expect((await call(elementsRoute.POST, req("POST", { ...base, room_id: "r1" }))).status).toBe(400);
    expect(seating.addElement).not.toHaveBeenCalled();
  });

  it("GET requires a UUID room_id", async () => {
    expect(await call(elementsRoute.GET, req("GET", undefined, { path: "/api/x" }))).toEqual({
      status: 400,
      body: { error: "room_id е задолжителен." },
    });
    expect(await call(elementsRoute.GET, req("GET", undefined, { path: "/api/x?room_id=abc" }))).toEqual({
      status: 400,
      body: { error: "Неважечки идентификатор." },
    });
  });
});

describe("seating element / confirm routes", () => {
  it("rejects a non-UUID element id", async () => {
    const res = await call(elementRoute.PATCH, req("PATCH", { type: "position", x_cm: 1, y_cm: 2 }), { id: INJECTION });
    expect(res).toEqual({ status: 400, body: { error: "Неважечки идентификатор." } });
    expect(seating.moveElement).not.toHaveBeenCalled();
  });

  it("keeps the unknown update type message", async () => {
    expect(await call(elementRoute.PATCH, req("PATCH", { type: "fly" }), { id: ID })).toEqual({
      status: 400,
      body: { error: "Непознат тип на ажурирање." },
    });
  });

  it("confirm POST rejects a non-UUID room_id", async () => {
    expect((await call(confirmRoute.POST, req("POST", { room_id: "x" }))).status).toBe(400);
    expect(seating.confirm).not.toHaveBeenCalled();
  });
});

describe("guest routes", () => {
  const guest = { full_name: "Ана", phone: null, party_size: 2, notes: null, side: "bride" };

  it("rejects party_size out of range", async () => {
    for (const party_size of [0, 51, 1.5]) {
      expect((await call(guestsRoute.POST, req("POST", { ...guest, party_size }))).status).toBe(400);
    }
    expect(guests.addGuest).not.toHaveBeenCalled();
  });

  it("rejects an over-long name", async () => {
    expect((await call(guestsRoute.POST, req("POST", { ...guest, full_name: "x".repeat(201) }))).status).toBe(400);
  });

  it("accepts the form body and drops unknown fields", async () => {
    const res = await call(guestsRoute.POST, req("POST", { ...guest, rsvp_status: "confirmed", event_id: "other" }));
    expect(res.status).toBe(200);
    expect(guests.addGuest).toHaveBeenCalledWith(EVENT, {
      full_name: "Ана",
      phone: null,
      party_size: 2,
      notes: null,
      side: "bride",
    });
  });

  it("rejects a bad rsvp_status enum and a non-UUID id", async () => {
    expect(
      (await call(guestRoute.PATCH, req("PATCH", { type: "status", rsvp_status: "maybe" }), { id: ID })).status,
    ).toBe(400);
    expect((await call(guestRoute.DELETE, req("DELETE"), { id: "1 or 1=1" })).status).toBe(400);
    expect(guests.updateGuestStatus).not.toHaveBeenCalled();
    expect(guests.deleteGuest).not.toHaveBeenCalled();
  });
});

describe("other couple routes reject before the DB", () => {
  it("agenda move with a bad direction", async () => {
    const res = await call(agendaItemRoute.PATCH, req("PATCH", { type: "move", direction: "left" }), { id: ID });
    expect(res).toEqual({ status: 400, body: { error: "Неважечки податоци." } });
    expect(dbAccess).not.toHaveBeenCalled();
  });

  it("notes with over-long title", async () => {
    expect((await call(notesRoute.POST, req("POST", { title: "x".repeat(201), content: "" }))).status).toBe(400);
    expect(dbAccess).not.toHaveBeenCalled();
  });

  it("guest-count keeps its messages", async () => {
    expect(await call(guestCountRoute.PATCH, req("PATCH", { guest_count_estimate: -3 }))).toEqual({
      status: 400,
      body: { error: "Бројот на гости мора да биде не-негативен број." },
    });
    expect(await call(guestCountRoute.PATCH, req("PATCH", "null"))).toEqual({
      status: 400,
      body: { error: "Неважечко JSON тело" },
    });
    expect(dbAccess).not.toHaveBeenCalled();
  });

  it("still returns 401 before validating when unauthenticated", async () => {
    const res = await call(guestsRoute.POST, req("POST", { full_name: 1 }, { couple: false }));
    expect(res.status).toBe(401);
  });
});

describe("public routes", () => {
  it("rsvp: rejects party_size out of range and a malformed slug", async () => {
    const body = { full_name: "Ана", attending: true, party_size: 500 };
    const res = await call(rsvpRoute.POST, req("POST", body, { couple: false }), { slug: "abcDEF123_-x" });
    expect(res.status).toBe(400);
    expect(await call(rsvpRoute.POST, req("POST", { ...body, party_size: 2 }, { couple: false }), { slug: "a),b" })).toEqual({
      status: 400,
      body: { error: "Invitation not found." },
    });
    expect(rsvp.submitRsvpBySlug).not.toHaveBeenCalled();
  });

  it("rsvp: keeps the required-fields message and accepts a valid body", async () => {
    expect(
      await call(rsvpRoute.POST, req("POST", { full_name: "Ана" }, { couple: false }), { slug: "abcDEF123_-x" }),
    ).toEqual({ status: 400, body: { error: "full_name and attending are required." } });
    const ok = await call(
      rsvpRoute.POST,
      req("POST", { full_name: "Ана", attending: true, party_size: 3 }, { couple: false }),
      { slug: "abcDEF123_-x" },
    );
    expect(ok).toEqual({ status: 200, body: { ok: true } });
    expect(rsvp.submitRsvpBySlug).toHaveBeenCalledWith(
      "abcDEF123_-x",
      { fullName: "Ана", attending: true, partySize: 3 },
      expect.objectContaining({ ip: expect.any(String) }),
    );
  });

  it("contact: rejects an over-long message", async () => {
    const res = await call(
      contactRoute.POST,
      req("POST", { name: "A", email: "a@b.mk", message: "x".repeat(5001) }, { couple: false }),
    );
    expect(res).toEqual({ status: 400, body: { error: "Name, email, or message is too long." } });
    expect(contact.submitContactMessage).not.toHaveBeenCalled();
  });
});
