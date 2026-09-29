// tests/supabase/couple-authz.test.ts
//
// TEST-002: cross-event authorization for every couple API route.
//
// Couple routes run on the service-role client (RLS bypassed), so the only
// thing keeping one couple out of another couple's data is each lib function
// scoping by the event id that proxy.ts puts in `x-couple-event-id`.
// This file calls every exported route handler directly as event A and
// throws event B's ids (and B's room) at it:
//
//   - event B's data is byte-for-byte unchanged afterwards (service-role
//     re-read of the event row and every event-owned table),
//   - no response to A ever contains B's data,
//   - each route still works for A's own rows (so a refusal is not vacuous).
//
// Both events live in the same venue, so the checks exercise event scoping,
// not venue scoping. Removing any `.eq("event_id", eventId)` filter from
// lib/couple/* makes one of these tests fail.
//
// A new route.ts under app/api/couple, or a new exported method, fails the
// coverage test until a case is added to ROUTES below.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { COUPLE_EVENT_HEADER, type RouteHandler } from "@/lib/api/handler";

import * as agendaRoute from "@/app/api/couple/agenda/route";
import * as agendaIdRoute from "@/app/api/couple/agenda/[id]/route";
import * as budgetRoute from "@/app/api/couple/budget/route";
import * as budgetIdRoute from "@/app/api/couple/budget/[id]/route";
import * as checklistRoute from "@/app/api/couple/checklist/route";
import * as checklistIdRoute from "@/app/api/couple/checklist/[id]/route";
import * as subtasksRoute from "@/app/api/couple/checklist/[id]/subtasks/route";
import * as subtaskIdRoute from "@/app/api/couple/checklist/[id]/subtasks/[subtaskId]/route";
import * as contactInfoRoute from "@/app/api/couple/contact-info/route";
import * as guestCountRoute from "@/app/api/couple/guest-count/route";
import * as guestsRoute from "@/app/api/couple/guests/route";
import * as guestsIdRoute from "@/app/api/couple/guests/[id]/route";
import * as guestsSeatRoute from "@/app/api/couple/guests/[id]/seat/route";
import * as guestsExportRoute from "@/app/api/couple/guests/export/route";
import * as guestsImportRoute from "@/app/api/couple/guests/import/route";
import * as invitationRoute from "@/app/api/couple/invitation/route";
import * as invitationPhotoRoute from "@/app/api/couple/invitation/photo/route";
import * as invitationPhotoConfirmRoute from "@/app/api/couple/invitation/photo/confirm/route";
import * as locationsRoute from "@/app/api/couple/locations/route";
import * as locationsIdRoute from "@/app/api/couple/locations/[id]/route";
import * as menuRoute from "@/app/api/couple/menu/route";
import * as menuQuantitiesRoute from "@/app/api/couple/menu/quantities/route";
import * as notesRoute from "@/app/api/couple/notes/route";
import * as notesIdRoute from "@/app/api/couple/notes/[id]/route";
import * as seatingConfirmRoute from "@/app/api/couple/seating/confirm/route";
import * as seatingElementsRoute from "@/app/api/couple/seating/elements/route";
import * as seatingElementIdRoute from "@/app/api/couple/seating/elements/[id]/route";
import * as seatingRevertRoute from "@/app/api/couple/seating/revert/route";
import * as seatingUndoRoute from "@/app/api/couple/seating/undo/route";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const RUN = `authz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
/** Planted in every text field of event B; must never appear in a response to A. */
const SECRET = `${RUN}-EVENT-B-SECRET`;

type Row = Record<string, unknown>;

interface EventFixture {
  eventId: string;
  roomId: string;
  guestId: string;
  budgetId: string;
  checklistId: string;
  subtaskId: string;
  agendaIds: [string, string];
  locationId: string;
  noteId: string;
  draftElementId: string;
  layoutElementId: string;
}

let venueId: string;
let menuTemplateId: string;
let menuItemIds: [string, string];
let A: EventFixture;
let B: EventFixture;
let bSnapshot: Record<string, Row[]>;
const uploadedPhotoPaths: string[] = [];

async function insert<T extends Row>(table: string, values: Row | Row[]): Promise<T[]> {
  const { data, error } = await admin.from(table).insert(values).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T[];
}

function draftElement(id: string, eventId: string, roomId: string, label: string): Row {
  return {
    id,
    event_id: eventId,
    room_id: roomId,
    element_type: "table",
    table_type_id: null,
    x_cm: 100,
    y_cm: 100,
    width_cm: 180,
    length_cm: 180,
    rotation_deg: 0,
    label,
  };
}

async function createEventFixture(tag: "A" | "B"): Promise<EventFixture> {
  const text = (s: string) => (tag === "B" ? `${s} ${SECRET}` : `${RUN} ${s} A`);
  const [room] = await insert<{ id: string }>("rooms", { venue_id: venueId, name: text("room") });
  await insert("room_layout_elements", {
    room_id: room.id,
    element_type: "stage",
    x_cm: 0,
    y_cm: 0,
    width_cm: 300,
    length_cm: 200,
    label: text("standard stage"),
  });
  const [event] = await insert<{ id: string }>("events", {
    venue_id: venueId,
    couple_names: text("couple"),
    event_date: "2027-09-01",
    guest_count_estimate: tag === "B" ? 77 : 10,
    contact_email: tag === "B" ? `${RUN}-b-secret@test.local` : null,
    contact_phone: tag === "B" ? SECRET : null,
    total_price: tag === "B" ? 12345 : null,
    checklist_seeded_at: new Date().toISOString(),
  });
  await insert("event_rooms", {
    event_id: event.id,
    room_id: room.id,
    layout_initialized_at: new Date().toISOString(),
  });

  const draftElementId = crypto.randomUUID();
  const draft = { [room.id]: [draftElement(draftElementId, event.id, room.id, text("draft table"))] };
  const { error: draftError } = await admin
    .from("events")
    .update({
      seating_draft: draft,
      seating_draft_undo: draft,
      seating_confirmed_at: tag === "B" ? { [room.id]: "2027-01-01T00:00:00.000Z" } : {},
    })
    .eq("id", event.id);
  if (draftError) throw draftError;

  const [layout] = await insert<{ id: string }>("event_layout_elements", {
    event_id: event.id,
    room_id: room.id,
    element_type: "table",
    x_cm: 100,
    y_cm: 100,
    width_cm: 180,
    length_cm: 180,
    label: text("confirmed table"),
  });

  const [guest] = await insert<{ id: string }>("event_guests", { event_id: event.id, full_name: text("guest") });
  const [budget] = await insert<{ id: string }>("event_budget_items", {
    event_id: event.id,
    category: "catering",
    name: text("budget"),
    estimated_amount: 1000,
    paid_amount: 100,
  });
  const [checklist] = await insert<{ id: string }>("event_checklist_items", {
    event_id: event.id,
    title: text("task"),
  });
  const [subtask] = await insert<{ id: string }>("event_checklist_subtasks", {
    checklist_item_id: checklist.id,
    title: text("subtask"),
  });
  const agenda = await insert<{ id: string }>("event_agenda_items", [
    { event_id: event.id, title: text("agenda 1"), sort_order: 0 },
    { event_id: event.id, title: text("agenda 2"), sort_order: 1 },
  ]);
  const [location] = await insert<{ id: string }>("event_locations", { event_id: event.id, label: text("location") });
  const [note] = await insert<{ id: string }>("event_notes", {
    event_id: event.id,
    title: text("note"),
    content: text("content"),
  });

  if (tag === "B") {
    await insert("event_invitations", {
      event_id: event.id,
      template_id: "classic",
      message: text("invitation"),
      photo_path: `${RUN}-b-photo.jpg`,
      public_slug: `${RUN}-b-slug`,
    });
    await insert("event_custom_menu_items", { event_id: event.id, menu_item_id: menuItemIds[0] });
    await insert("event_menu_item_quantities", { event_id: event.id, menu_item_id: menuItemIds[0], guest_count: 42 });
  }

  return {
    eventId: event.id,
    roomId: room.id,
    guestId: guest.id,
    budgetId: budget.id,
    checklistId: checklist.id,
    subtaskId: subtask.id,
    agendaIds: [agenda[0].id, agenda[1].id],
    locationId: location.id,
    noteId: note.id,
    draftElementId,
    layoutElementId: layout.id,
  };
}

/** Everything event B owns, read with the service-role client in a stable order. */
async function snapshotEvent(f: EventFixture): Promise<Record<string, Row[]>> {
  const byEvent = async (table: string, key = "event_id", order = "id") => {
    const q = admin.from(table).select("*").eq(key, f.eventId);
    const { data, error } = await (order ? q.order(order) : q);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Row[];
  };
  const { data: subtasks, error: subtaskError } = await admin
    .from("event_checklist_subtasks")
    .select("*, event_checklist_items!inner(event_id)")
    .eq("event_checklist_items.event_id", f.eventId)
    .order("id");
  if (subtaskError) throw subtaskError;
  return {
    events: await byEvent("events", "id"),
    event_rooms: await byEvent("event_rooms", "event_id", ""),
    event_layout_elements: await byEvent("event_layout_elements"),
    event_guests: await byEvent("event_guests"),
    event_budget_items: await byEvent("event_budget_items"),
    event_checklist_items: await byEvent("event_checklist_items"),
    event_checklist_subtasks: subtasks as Row[],
    event_agenda_items: await byEvent("event_agenda_items"),
    event_locations: await byEvent("event_locations"),
    event_notes: await byEvent("event_notes"),
    event_invitations: await byEvent("event_invitations", "event_id", ""),
    event_custom_menu_items: await byEvent("event_custom_menu_items", "event_id", ""),
    event_menu_item_quantities: await byEvent("event_menu_item_quantities", "event_id", ""),
  };
}

async function expectBUntouched() {
  expect(await snapshotEvent(B)).toEqual(bSnapshot);
}

/** B's identifiers that must never show up in a response to A. */
function bSecrets(): string[] {
  return [
    SECRET,
    B.eventId,
    B.guestId,
    B.budgetId,
    B.checklistId,
    B.subtaskId,
    ...B.agendaIds,
    B.locationId,
    B.noteId,
    B.draftElementId,
    B.layoutElementId,
    `${RUN}-b-slug`,
    `${RUN}-b-photo.jpg`,
    `${RUN}-b-secret@test.local`,
  ];
}

type CallOptions = { body?: unknown; query?: Record<string, string>; form?: FormData };

/** Invokes a route handler as event A, the way it runs behind proxy.ts. */
async function call<P>(
  handler: RouteHandler<P>,
  params: P,
  method: string,
  opts: CallOptions = {},
): Promise<{ status: number; text: string; json: unknown }> {
  const headers = new Headers({ [COUPLE_EVENT_HEADER]: A.eventId });
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : "";
  const res = await handler(new NextRequest(`http://localhost/api/couple/test${qs}`, { method, headers, body }), {
    params,
  });
  const text = await res.text();
  for (const secret of bSecrets()) expect(text, `response leaked ${secret}`).not.toContain(secret);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, text, json };
}

const NONE = {} as Record<string, never>;

async function adminRow(table: string, id: string): Promise<Row | null> {
  const { data, error } = await admin.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

async function resetASeating() {
  const draft = { [A.roomId]: [draftElement(A.draftElementId, A.eventId, A.roomId, `${RUN} draft table A`)] };
  const { error } = await admin
    .from("events")
    .update({ seating_draft: draft, seating_draft_undo: draft, seating_confirmed_at: {} })
    .eq("id", A.eventId);
  if (error) throw error;
}

async function aEvent(): Promise<Row> {
  return (await adminRow("events", A.eventId))!;
}

// ---------------------------------------------------------------------------
// One entry per route file (relative to app/api/couple), one test per
// exported method. Each test attacks with B's ids, checks A's own control
// call worked, and ends by asserting B is untouched.

type MethodTests = Record<string, () => Promise<void>>;

const ROUTES: Record<string, { module: Record<string, unknown>; methods: MethodTests }> = {
  "agenda/route.ts": {
    module: agendaRoute,
    methods: {
      GET: async () => {
        const res = await call(agendaRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        expect((res.json as Row[]).map((r) => r.id).sort()).toEqual([...A.agendaIds].sort());
      },
      POST: async () => {
        const res = await call(agendaRoute.POST, NONE, "POST", { body: { title: "A new agenda" } });
        expect(res.status).toBe(200);
        expect((res.json as Row).event_id).toBe(A.eventId);
      },
    },
  },
  "agenda/[id]/route.ts": {
    module: agendaIdRoute,
    methods: {
      PATCH: async () => {
        for (const id of B.agendaIds) {
          expect((await call(agendaIdRoute.PATCH, { id }, "PATCH", { body: { title: "hijacked" } })).status).toBe(400);
          for (const direction of ["up", "down"]) {
            const res = await call(agendaIdRoute.PATCH, { id }, "PATCH", { body: { type: "move", direction } });
            expect(res.status).toBe(400);
          }
        }
        const own = await call(agendaIdRoute.PATCH, { id: A.agendaIds[0] }, "PATCH", { body: { title: "A edited" } });
        expect(own.status).toBe(200);
        expect((await adminRow("event_agenda_items", A.agendaIds[0]))!.title).toBe("A edited");
      },
      DELETE: async () => {
        await call(agendaIdRoute.DELETE, { id: B.agendaIds[0] }, "DELETE");
        expect(await adminRow("event_agenda_items", B.agendaIds[0])).not.toBeNull();
        expect((await call(agendaIdRoute.DELETE, { id: A.agendaIds[1] }, "DELETE")).status).toBe(200);
        expect(await adminRow("event_agenda_items", A.agendaIds[1])).toBeNull();
      },
    },
  },
  "budget/route.ts": {
    module: budgetRoute,
    methods: {
      GET: async () => {
        const res = await call(budgetRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        expect(res.text).toContain(A.budgetId);
      },
      POST: async () => {
        const res = await call(budgetRoute.POST, NONE, "POST", { body: { category: "other", name: "A new" } });
        expect(res.status).toBe(200);
        expect((res.json as Row).event_id ?? A.eventId).toBe(A.eventId);
      },
    },
  },
  "budget/[id]/route.ts": {
    module: budgetIdRoute,
    methods: {
      PATCH: async () => {
        const body = { category: "other", name: "hijacked", estimated_amount: 1, paid_amount: 1 };
        expect((await call(budgetIdRoute.PATCH, { id: B.budgetId }, "PATCH", { body })).status).toBe(400);
        const own = await call(budgetIdRoute.PATCH, { id: A.budgetId }, "PATCH", { body: { ...body, name: "A edited" } });
        expect(own.status).toBe(200);
        expect((await adminRow("event_budget_items", A.budgetId))!.name).toBe("A edited");
      },
      DELETE: async () => {
        await call(budgetIdRoute.DELETE, { id: B.budgetId }, "DELETE");
        expect(await adminRow("event_budget_items", B.budgetId)).not.toBeNull();
      },
    },
  },
  "checklist/route.ts": {
    module: checklistRoute,
    methods: {
      GET: async () => {
        const res = await call(checklistRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        expect(res.text).toContain(A.checklistId);
        expect(res.text).toContain(A.subtaskId);
      },
      POST: async () => {
        const res = await call(checklistRoute.POST, NONE, "POST", { body: { title: "A new task" } });
        expect(res.status).toBe(200);
        expect((res.json as Row).event_id ?? A.eventId).toBe(A.eventId);
      },
    },
  },
  "checklist/[id]/route.ts": {
    module: checklistIdRoute,
    methods: {
      PATCH: async () => {
        const id = B.checklistId;
        expect((await call(checklistIdRoute.PATCH, { id }, "PATCH", { body: { title: "hijacked" } })).status).toBe(400);
        const toggle = { type: "toggle", is_done: true };
        expect((await call(checklistIdRoute.PATCH, { id }, "PATCH", { body: toggle })).status).toBe(400);
        const own = await call(checklistIdRoute.PATCH, { id: A.checklistId }, "PATCH", { body: toggle });
        expect(own.status).toBe(200);
        expect((await adminRow("event_checklist_items", A.checklistId))!.is_done).toBe(true);
      },
      DELETE: async () => {
        await call(checklistIdRoute.DELETE, { id: B.checklistId }, "DELETE");
        expect(await adminRow("event_checklist_items", B.checklistId)).not.toBeNull();
      },
    },
  },
  "checklist/[id]/subtasks/route.ts": {
    module: subtasksRoute,
    methods: {
      POST: async () => {
        const res = await call(subtasksRoute.POST, { id: B.checklistId }, "POST", { body: { title: "planted" } });
        expect(res.status).toBe(400);
        const own = await call(subtasksRoute.POST, { id: A.checklistId }, "POST", { body: { title: "A sub" } });
        expect(own.status).toBe(200);
      },
    },
  },
  "checklist/[id]/subtasks/[subtaskId]/route.ts": {
    module: subtaskIdRoute,
    methods: {
      PATCH: async () => {
        const body = { is_done: true };
        // B's item + B's subtask, and A's own item + B's subtask.
        for (const id of [B.checklistId, A.checklistId]) {
          const res = await call(subtaskIdRoute.PATCH, { id, subtaskId: B.subtaskId }, "PATCH", { body });
          expect(res.status).toBe(400);
        }
        const own = await call(subtaskIdRoute.PATCH, { id: A.checklistId, subtaskId: A.subtaskId }, "PATCH", { body });
        expect(own.status).toBe(200);
        expect((await adminRow("event_checklist_subtasks", A.subtaskId))!.is_done).toBe(true);
      },
      DELETE: async () => {
        for (const id of [B.checklistId, A.checklistId]) {
          await call(subtaskIdRoute.DELETE, { id, subtaskId: B.subtaskId }, "DELETE");
        }
        expect(await adminRow("event_checklist_subtasks", B.subtaskId)).not.toBeNull();
      },
    },
  },
  "contact-info/route.ts": {
    module: contactInfoRoute,
    methods: {
      PATCH: async () => {
        const res = await call(contactInfoRoute.PATCH, NONE, "PATCH", {
          body: { contact_email: "a@test.local", contact_phone: "111", event_id: B.eventId, id: B.eventId },
        });
        expect(res.status).toBe(200);
        expect((await aEvent()).contact_email).toBe("a@test.local");
      },
    },
  },
  "guest-count/route.ts": {
    module: guestCountRoute,
    methods: {
      PATCH: async () => {
        const res = await call(guestCountRoute.PATCH, NONE, "PATCH", {
          body: { guest_count_estimate: 5, event_id: B.eventId },
        });
        expect(res.status).toBe(200);
        expect((await aEvent()).guest_count_estimate).toBe(5);
      },
    },
  },
  "guests/route.ts": {
    module: guestsRoute,
    methods: {
      GET: async () => {
        const res = await call(guestsRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        expect(res.text).toContain(A.guestId);
      },
      POST: async () => {
        const res = await call(guestsRoute.POST, NONE, "POST", { body: { full_name: "A new guest" } });
        expect(res.status).toBe(200);
        expect((res.json as Row).event_id ?? A.eventId).toBe(A.eventId);
      },
    },
  },
  "guests/[id]/route.ts": {
    module: guestsIdRoute,
    methods: {
      PATCH: async () => {
        const id = B.guestId;
        for (const body of [
          { full_name: "hijacked" },
          { type: "status", rsvp_status: "declined" },
          { type: "side", side: "groom" },
        ]) {
          expect((await call(guestsIdRoute.PATCH, { id }, "PATCH", { body })).status).toBe(400);
        }
        const own = await call(guestsIdRoute.PATCH, { id: A.guestId }, "PATCH", {
          body: { type: "status", rsvp_status: "confirmed" },
        });
        expect(own.status).toBe(200);
        expect((await adminRow("event_guests", A.guestId))!.rsvp_status).toBe("confirmed");
      },
      DELETE: async () => {
        await call(guestsIdRoute.DELETE, { id: B.guestId }, "DELETE");
        expect(await adminRow("event_guests", B.guestId)).not.toBeNull();
      },
    },
  },
  "guests/[id]/seat/route.ts": {
    module: guestsSeatRoute,
    methods: {
      GET: async () => {
        expect((await call(guestsSeatRoute.GET, { id: B.guestId }, "GET")).json).toEqual({ seat: null });
        expect((await call(guestsSeatRoute.GET, { id: A.guestId }, "GET")).status).toBe(200);
      },
    },
  },
  "guests/export/route.ts": {
    module: guestsExportRoute,
    methods: {
      GET: async () => {
        const res = await call(guestsExportRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        const { data: own } = await admin.from("event_guests").select("full_name").eq("id", A.guestId).single();
        expect(res.text).toContain(own!.full_name);
      },
    },
  },
  "guests/import/route.ts": {
    module: guestsImportRoute,
    methods: {
      POST: async () => {
        const csv = `Име и презиме\n${RUN} imported guest\n`;
        const res = await call(guestsImportRoute.POST, NONE, "POST", { body: { csv, event_id: B.eventId } });
        expect(res.json).toEqual({ imported: 1, skipped: 0 });
        const { data } = await admin.from("event_guests").select("event_id").eq("full_name", `${RUN} imported guest`);
        expect(data).toEqual([{ event_id: A.eventId }]);
      },
    },
  },
  "invitation/route.ts": {
    module: invitationRoute,
    methods: {
      GET: async () => {
        const res = await call(invitationRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
      },
      PUT: async () => {
        const res = await call(invitationRoute.PUT, NONE, "PUT", {
          body: { template_id: "modern", message: "A message", event_id: B.eventId },
        });
        expect(res.status).toBe(200);
        expect((res.json as Row).event_id).toBe(A.eventId);
        const again = await call(invitationRoute.GET, NONE, "GET");
        expect((again.json as Row).message).toBe("A message");
      },
    },
  },
  "invitation/photo/route.ts": {
    module: invitationPhotoRoute,
    methods: {
      POST: async () => {
        // SEC-005: returns a signed upload for A's own staging folder only.
        const res = await call(invitationPhotoRoute.POST, NONE, "POST");
        expect(res.status).toBe(200);
        const { path } = res.json as { path: string; token: string };
        expect(path.startsWith(`uploads/${A.eventId}/`)).toBe(true);
      },
    },
  },
  "invitation/photo/confirm/route.ts": {
    module: invitationPhotoConfirmRoute,
    methods: {
      POST: async () => {
        // A cannot attach a file from B's staging folder (or any other path).
        const bPath = `uploads/${B.eventId}/00000000-0000-4000-8000-000000000000`;
        const res = await call(invitationPhotoConfirmRoute.POST, NONE, "POST", { body: { path: bPath } });
        expect(res.status).toBe(400);
        const { data } = await admin.from("event_invitations").select("photo_path").eq("event_id", B.eventId).single();
        expect(data!.photo_path).toBe(`${RUN}-b-photo.jpg`);
      },
    },
  },
  "locations/route.ts": {
    module: locationsRoute,
    methods: {
      GET: async () => {
        const res = await call(locationsRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        expect(res.text).toContain(A.locationId);
      },
      POST: async () => {
        const res = await call(locationsRoute.POST, NONE, "POST", { body: { label: "A new place" } });
        expect(res.status).toBe(200);
      },
    },
  },
  "locations/[id]/route.ts": {
    module: locationsIdRoute,
    methods: {
      PATCH: async () => {
        const res = await call(locationsIdRoute.PATCH, { id: B.locationId }, "PATCH", { body: { label: "hijacked" } });
        expect(res.status).toBe(400);
        const own = await call(locationsIdRoute.PATCH, { id: A.locationId }, "PATCH", { body: { label: "A edited" } });
        expect(own.status).toBe(200);
        expect((await adminRow("event_locations", A.locationId))!.label).toBe("A edited");
      },
      DELETE: async () => {
        await call(locationsIdRoute.DELETE, { id: B.locationId }, "DELETE");
        expect(await adminRow("event_locations", B.locationId)).not.toBeNull();
      },
    },
  },
  "menu/route.ts": {
    module: menuRoute,
    methods: {
      PATCH: async () => {
        const template = await call(menuRoute.PATCH, NONE, "PATCH", {
          body: { mode: "template", menu_template_id: menuTemplateId },
        });
        expect(template.status).toBe(200);
        expect((await aEvent()).menu_template_id).toBe(menuTemplateId);
        const custom = await call(menuRoute.PATCH, NONE, "PATCH", {
          body: { mode: "custom", menu_item_ids: menuItemIds },
        });
        expect(custom.status).toBe(200);
        const { data } = await admin.from("event_custom_menu_items").select("menu_item_id").eq("event_id", A.eventId);
        expect(data).toHaveLength(2);
      },
    },
  },
  "menu/quantities/route.ts": {
    module: menuQuantitiesRoute,
    methods: {
      GET: async () => {
        const res = await call(menuQuantitiesRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        // B has a quantity row (guest_count 42); A has none yet.
        expect(res.json).toEqual([]);
      },
      PATCH: async () => {
        const res = await call(menuQuantitiesRoute.PATCH, NONE, "PATCH", {
          body: { quantities: [{ menu_item_id: menuItemIds[0], guest_count: 3 }] },
        });
        expect(res.status).toBe(200);
        const again = await call(menuQuantitiesRoute.GET, NONE, "GET");
        expect(again.json).toEqual([{ menu_item_id: menuItemIds[0], guest_count: 3 }]);
      },
    },
  },
  "notes/route.ts": {
    module: notesRoute,
    methods: {
      GET: async () => {
        const res = await call(notesRoute.GET, NONE, "GET");
        expect(res.status).toBe(200);
        expect(res.text).toContain(A.noteId);
      },
      POST: async () => {
        const res = await call(notesRoute.POST, NONE, "POST", { body: { content: "A new note" } });
        expect(res.status).toBe(200);
      },
    },
  },
  "notes/[id]/route.ts": {
    module: notesIdRoute,
    methods: {
      PATCH: async () => {
        const res = await call(notesIdRoute.PATCH, { id: B.noteId }, "PATCH", { body: { content: "hijacked" } });
        expect(res.status).toBe(400);
        const own = await call(notesIdRoute.PATCH, { id: A.noteId }, "PATCH", { body: { content: "A edited" } });
        expect(own.status).toBe(200);
        expect((await adminRow("event_notes", A.noteId))!.content).toBe("A edited");
      },
      DELETE: async () => {
        await call(notesIdRoute.DELETE, { id: B.noteId }, "DELETE");
        expect(await adminRow("event_notes", B.noteId)).not.toBeNull();
      },
    },
  },
  "seating/confirm/route.ts": {
    module: seatingConfirmRoute,
    methods: {
      GET: async () => {
        await resetASeating();
        const res = await call(seatingConfirmRoute.GET, NONE, "GET", { query: { room_id: B.roomId } });
        expect(res.status).toBe(400);
        const own = await call(seatingConfirmRoute.GET, NONE, "GET", { query: { room_id: A.roomId } });
        expect(own.status).toBe(200);
      },
      POST: async () => {
        await resetASeating();
        const res = await call(seatingConfirmRoute.POST, NONE, "POST", { body: { room_id: B.roomId } });
        expect(res.status).toBe(400);
        const own = await call(seatingConfirmRoute.POST, NONE, "POST", { body: { room_id: A.roomId } });
        expect(own.status).toBe(200);
        expect((await aEvent()).seating_confirmed_at).toHaveProperty(A.roomId);
      },
      DELETE: async () => {
        const res = await call(seatingConfirmRoute.DELETE, NONE, "DELETE", { query: { room_id: B.roomId } });
        expect(res.status).toBe(400);
      },
    },
  },
  "seating/elements/route.ts": {
    module: seatingElementsRoute,
    methods: {
      GET: async () => {
        await resetASeating();
        const res = await call(seatingElementsRoute.GET, NONE, "GET", { query: { room_id: B.roomId } });
        expect(res.status).toBe(400);
        const own = await call(seatingElementsRoute.GET, NONE, "GET", { query: { room_id: A.roomId } });
        expect(own.status).toBe(200);
        expect(own.text).toContain(A.draftElementId);
      },
      POST: async () => {
        await resetASeating();
        const element = { element_type: "table", x_cm: 1, y_cm: 1, width_cm: 100, length_cm: 100 };
        const res = await call(seatingElementsRoute.POST, NONE, "POST", {
          // event_id in the body is overwritten by the route; room B is refused.
          body: { ...element, room_id: B.roomId, event_id: B.eventId },
        });
        expect(res.status).toBe(400);
        const own = await call(seatingElementsRoute.POST, NONE, "POST", {
          body: { ...element, room_id: A.roomId, event_id: B.eventId },
        });
        expect(own.status).toBe(200);
        expect((own.json as Row).event_id).toBe(A.eventId);
      },
    },
  },
  "seating/elements/[id]/route.ts": {
    module: seatingElementIdRoute,
    methods: {
      PATCH: async () => {
        await resetASeating();
        for (const id of [B.draftElementId, B.layoutElementId]) {
          for (const body of [
            { type: "position", x_cm: 5, y_cm: 5 },
            { type: "size", width_cm: 5, length_cm: 5 },
            { type: "rotation", rotation_deg: 45 },
          ]) {
            expect((await call(seatingElementIdRoute.PATCH, { id }, "PATCH", { body })).status).toBe(400);
          }
        }
        const own = await call(seatingElementIdRoute.PATCH, { id: A.draftElementId }, "PATCH", {
          body: { type: "rotation", rotation_deg: 90 },
        });
        expect(own.status).toBe(200);
        expect((own.json as Row).rotation_deg).toBe(90);
      },
      DELETE: async () => {
        await resetASeating();
        for (const id of [B.draftElementId, B.layoutElementId]) {
          await call(seatingElementIdRoute.DELETE, { id }, "DELETE");
        }
        expect((await call(seatingElementIdRoute.DELETE, { id: A.draftElementId }, "DELETE")).status).toBe(200);
      },
    },
  },
  "seating/revert/route.ts": {
    module: seatingRevertRoute,
    methods: {
      POST: async () => {
        await resetASeating();
        const res = await call(seatingRevertRoute.POST, NONE, "POST", { body: { room_id: B.roomId } });
        expect(res.status).toBe(400);
        const own = await call(seatingRevertRoute.POST, NONE, "POST", { body: { room_id: A.roomId } });
        expect(own.status).toBe(200);
      },
    },
  },
  "seating/undo/route.ts": {
    module: seatingUndoRoute,
    methods: {
      POST: async () => {
        await resetASeating();
        const res = await call(seatingUndoRoute.POST, NONE, "POST", { body: { room_id: B.roomId } });
        expect(res.status).toBe(400);
        const own = await call(seatingUndoRoute.POST, NONE, "POST", { body: { room_id: A.roomId } });
        expect(own.status).toBe(200);
      },
    },
  },
};

/** Session routes: they establish the event id rather than trust it. */
const EXCLUDED = new Set(["login/route.ts", "logout/route.ts"]);
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function listRouteFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(full, base);
    return entry.name === "route.ts" ? [path.relative(base, full).split(path.sep).join("/")] : [];
  });
}

beforeAll(async () => {
  const [venue] = await insert<{ id: string }>("venues", { name: `${RUN} venue` });
  venueId = venue.id;
  const [template] = await insert<{ id: string }>("menu_templates", { venue_id: venueId, name: `${RUN} menu` });
  menuTemplateId = template.id;
  const items = await insert<{ id: string }>("menu_items", [
    { venue_id: venueId, course: "main", name: `${RUN} main`, tiers: ["special"] },
    { venue_id: venueId, course: "dessert", name: `${RUN} dessert`, tiers: ["special"] },
  ]);
  menuItemIds = [items[0].id, items[1].id];
  await insert(
    "menu_template_items",
    menuItemIds.map((id) => ({ menu_template_id: menuTemplateId, menu_item_id: id })),
  );

  A = await createEventFixture("A");
  B = await createEventFixture("B");
  bSnapshot = await snapshotEvent(B);
}, 60_000);

afterAll(async () => {
  if (uploadedPhotoPaths.length) await admin.storage.from("invitation-photos").remove(uploadedPhotoPaths);
  if (venueId) await admin.from("venues").delete().eq("id", venueId);
});

describe("couple API cross-event authorization (TEST-002)", () => {
  it("covers every couple route file and every exported method", () => {
    const files = listRouteFiles(path.join(process.cwd(), "app/api/couple")).filter((f) => !EXCLUDED.has(f));
    expect(files.sort(), "new couple route: add it to ROUTES").toEqual(Object.keys(ROUTES).sort());

    for (const [file, { module, methods }] of Object.entries(ROUTES)) {
      const exported = Object.keys(module).filter((k) => HTTP_METHODS.includes(k));
      expect(exported.sort(), `${file}: every exported method needs a test`).toEqual(Object.keys(methods).sort());
    }
  });

  it("the fixture is realistic: B's snapshot holds a row in every event-owned table", () => {
    for (const [table, rows] of Object.entries(bSnapshot)) expect(rows.length, table).toBeGreaterThan(0);
  });

  describe.each(Object.entries(ROUTES))("%s", (_file, { methods }) => {
    it.each(Object.entries(methods))("%s as event A leaves event B untouched and unseen", async (_method, run) => {
      await run();
      await expectBUntouched();
    });
  });

  it("rejects a request with no event header (middleware did not authenticate)", async () => {
    const res = await guestsRoute.GET(new NextRequest("http://localhost/api/couple/guests"), { params: NONE });
    expect(res.status).toBe(401);
  });
});
