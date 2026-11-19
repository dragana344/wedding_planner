import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { ERASED_COUPLE_NAMES } from "@/lib/privacy/erase";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import { addMonths } from "@/lib/couple/access";
import { todayIn } from "@/lib/date";
import { COLUMN_CLASSIFICATION } from "./privacy-classification";

// Group A task 1 (0170, support tickets: task 2 / 0171; RSVP answers: group B task 1 / 0179): the automatic retention erasure removes every
// personal row of an event but keeps the venue's business record (organizer
// names/contacts, date, money, rooms, tables, menu counts); an erasure on
// request removes the organizer too. Plus the couple-access end rules
// (cancellation trigger, admin extension) the daily sweep relies on.

vi.setConfig({ testTimeout: 30_000 });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let db: Client;
let venueId: string;
let roomId: string;

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw error;
  return data as NonNullable<T>;
}

type Seeded = { eventId: string; checklistId: string; tag: string; ticketId: string };

/** One event with a row in every personal-data table the couple and guests fill. */
async function seedEvent(tag: string, eventDate = "2027-06-01"): Promise<Seeded> {
  const event = await must(
    admin
      .from("events")
      .insert({
        venue_id: venueId, couple_names: `Couple ${tag}`, event_date: eventDate, contact_email: `${tag}@couple.test`,
        contact_email_2: `${tag}-2@couple.test`, contact_phone: `070-${tag}`, total_price: 1000, deposit_paid: 200, guest_count_estimate: 80,
      })
      .select("id")
      .single(),
  );
  const eventId = event.id as string;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: roomId }));
  await must(admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `cov-${tag}`, p_password: "long-enough-password" }));
  await must(admin.rpc("create_co_organizer", { p_event_id: eventId, p_side: "bride", p_username: `cov-co-${tag}`, p_password: "long-enough-password" }));
  await must(admin.from("couple_sessions").insert({ token: `cov-tok-${tag}`, event_id: eventId, expires_at: new Date(Date.now() + 86_400_000).toISOString() }));
  const guest = await must(
    admin.from("event_guests").insert({ event_id: eventId, full_name: `Guest ${tag}`, phone: `071-${tag}`, notes: `Allergy ${tag}` }).select("id").single(),
  );
  await must(admin.from("event_notes").insert({ event_id: eventId, title: `Note ${tag}`, content: `Content ${tag}` }));
  await must(admin.from("event_agenda_items").insert({ event_id: eventId, title: `Agenda ${tag}`, sort_order: 0 }));
  await must(admin.from("event_locations").insert({ event_id: eventId, label: `Home ${tag}`, address: `Street ${tag}` }));
  await must(admin.from("event_budget_items").insert({ event_id: eventId, category: "other", name: `Vendor ${tag}`, paid_amount: 10 }));
  const checklist = await must(admin.from("event_checklist_items").insert({ event_id: eventId, title: `Task ${tag}` }).select("id").single());
  await must(admin.from("event_checklist_subtasks").insert({ checklist_item_id: checklist.id, title: `Subtask ${tag}` }));
  const menu = await must(admin.from("menu_templates").insert({ venue_id: venueId, name: `Menu ${tag}` }).select("id").single());
  await must(admin.from("event_menu_templates").insert({ event_id: eventId, menu_template_id: menu.id }));
  await must(
    admin.from("event_menu_submissions").insert({
      event_id: eventId, sent_by: "Младенците", counts: { [menu.id]: 80 }, menu_titles: { [menu.id]: `Menu ${tag}` }, total: 80,
      seen_at: new Date().toISOString(), seen_by: `Manager ${tag}`, allergy_summary: `Nuts ${tag}`,
    }),
  );
  const tableType = await must(
    admin.from("table_types").insert({ room_id: roomId, name: `Round ${tag}`, shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 1 }).select("id").single(),
  );
  const table = await must(
    admin.from("event_layout_elements").insert({
      event_id: eventId, room_id: roomId, element_type: "table", table_type_id: tableType.id, x_cm: 0, y_cm: 0, width_cm: 100, length_cm: 100, label: `Table ${tag}`,
    }).select("id").single(),
  );
  await must(admin.from("events").update({ seating_draft: { [roomId]: [{ id: table.id, element_type: "table", table_type_id: tableType.id, label: `Draft ${tag}` }] } }).eq("id", eventId));
  await must(admin.from("event_seat_assignments").insert({ event_id: eventId, room_id: roomId, layout_element_id: table.id, seat_number: 1, guest_name: `Seated ${tag}` }));
  await must(admin.from("event_invitations").insert({ event_id: eventId, template_id: "classic", public_slug: `cov-${tag}`, message: `Welcome ${tag}` }));
  await must(admin.from("event_albums").insert({ event_id: eventId, public_token: `cov-album-${tag}`.padEnd(24, "x") }));
  await must(
    admin.from("event_photos").insert({
      event_id: eventId, storage_path: `${eventId}/photos/1.png`, bytes: 8, mime: "image/png", uploader_name: `Uploader ${tag}`, consent_at: new Date().toISOString(),
    }),
  );
  await must(admin.from("event_greetings").insert({ event_id: eventId, guest_id: guest.id, first_name: "Greeter", last_name: tag, message: `Greeting ${tag}` }));
  // 0179: an applied answer and one still waiting for the couple (no guest).
  await must(
    admin.from("event_rsvp_answers").insert([
      {
        event_id: eventId, guest_id: guest.id, source: "shared", full_name: `Guest ${tag}`, phone: `071-${tag}`, status: "confirmed", party_size: 2,
        allergies: `Nuts ${tag}`, comment: `See you ${tag}`, household_names: [`Plus ${tag}`], match: "exact", review_state: "none",
        before: { status: "invited", party_size: 1, children_count: 0, menu_counts: {}, allergies: null, household_names: [] },
        after: { status: "confirmed", party_size: 2, children_count: 0, menu_counts: {}, allergies: `Nuts ${tag}`, household_names: [`Plus ${tag}`] },
      },
    ]),
  );
  const unsure = await must(
    admin
      .from("event_rsvp_answers")
      .insert({ event_id: eventId, source: "shared", full_name: `Unsure ${tag}`, phone: `072-${tag}`, status: "declined", match: "review", review_state: "pending" })
      .select("id")
      .single(),
  );
  // 0180: a greeting sent with that pending answer, under a one-word name.
  await must(admin.from("event_greetings").insert({ event_id: eventId, rsvp_answer_id: unsure.id, first_name: `Unsure${tag}`, last_name: "", message: `Pending ${tag}` }));
  // 0171: a support ticket the couple sent, with a reply in its thread.
  const ticket = await must(
    admin.from("support_tickets").insert({
      venue_id: venueId, event_id: eventId, submitted_by: "couple", name: `Couple ${tag}`, problem: `Problem ${tag}`, description: `Details ${tag}`,
    }).select("id").single(),
  );
  await must(admin.from("support_ticket_messages").insert({ ticket_id: ticket.id, author: "requester", body: `Reply ${tag}` }));
  return { eventId, checklistId: checklist.id, tag, ticketId: ticket.id as string };
}

/** Classified tables that still hold personal/secret values for the event (same check as privacy.test.ts). */
async function remainingPersonalData(eventId: string, checklistId: string): Promise<string[]> {
  const leftovers: string[] = [];
  for (const [table, columns] of Object.entries(COLUMN_CLASSIFICATION)) {
    if (table === "audit_log") continue; // append-only by design
    const sensitive = Object.entries(columns).filter(([, c]) => c === "personal" || c === "secret").map(([name]) => name);
    if (sensitive.length === 0) continue;
    let where: string;
    let param = eventId;
    if (table === "events") where = "id = $1";
    else if ("event_id" in columns) where = "event_id = $1";
    else if ("checklist_item_id" in columns) {
      where = "checklist_item_id = $1";
      param = checklistId;
    } else continue;
    const notEmpty = sensitive
      .map((c) => {
        if ((table === "events" && c === "couple_names") || (table === "reservations" && c === "guest_name")) return `${c} <> '${ERASED_COUPLE_NAMES}'`;
        if (table === "reservations" && c === "phone") return `${c} <> ''`;
        if (table === "events" && (c.startsWith("seating_draft") || c.endsWith("_history"))) return `${c} <> '{}'::jsonb`;
        return `${c} is not null`;
      })
      .join(" or ");
    const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${where} and (${notEmpty})`, [param]);
    if (rows[0].n > 0) leftovers.push(table);
  }
  return leftovers;
}

async function newMiniEvent(tag: string): Promise<string> {
  return (await must(
    admin.rpc("create_event_full", {
      p_venue_id: venueId, p_couple_names: `Mini ${tag}`, p_event_date: "2027-06-01", p_start_time: "18:00", p_end_time: null,
      p_event_type: "birthday", p_status: "preparation", p_guest_count_estimate: 10, p_room_ids: [roomId], p_contact_email: `${tag}@mini.test`,
      p_contact_email_2: null, p_contact_phone: "070 999 888", p_total_price: 300, p_deposit_paid: null, p_username: `cov-mini-${tag}`,
      p_password: "a-strong-password-1", p_menu_template_ids: null, p_seating_mode: "mini",
    }),
  )) as unknown as string;
}

const erase = (eventId: string, reason: string) => must(admin.rpc("erase_event_personal_data", { p_event_id: eventId, p_reason: reason }));
const accessEnd = async (eventId: string) => (await must(admin.rpc("event_access_end", { p_event_id: eventId }))) as unknown as string;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  venueId = (await must(admin.from("venues").insert({ name: `Erase Coverage ${stamp}` }).select("id").single())).id;
  roomId = (await must(admin.from("rooms").insert({ venue_id: venueId, name: "Hall" }).select("id").single())).id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("contact_submissions").delete().like("email", `%-${stamp}@coverage.test`);
  await drainStorageCleanupQueue();
  await db.end();
});

describe("erase coverage (0170)", () => {
  it("retention erasure removes every personal row but keeps the venue's business record", async () => {
    const s = await seedEvent(`ret${stamp}`);
    expect(await erase(s.eventId, "retention")).toBe(true);

    // Only the event row's organizer fields remain personal.
    expect(await remainingPersonalData(s.eventId, s.checklistId)).toEqual(["events"]);
    expect(await must(admin.from("events").select("*").eq("id", s.eventId).single())).toMatchObject({
      couple_names: `Couple ${s.tag}`, contact_email: `${s.tag}@couple.test`, contact_email_2: `${s.tag}-2@couple.test`, contact_phone: `070-${s.tag}`,
      event_date: "2027-06-01", total_price: 1000, deposit_paid: 200, guest_count_estimate: 80, seating_draft: {},
    });
    for (const table of ["event_guests", "event_rsvp_answers", "event_greetings", "event_photos", "event_albums", "event_budget_items", "event_notes", "event_invitations", "event_co_organizers"]) {
      expect((await admin.from(table).select("event_id").eq("event_id", s.eventId)).data, table).toEqual([]);
    }
    // Business data the venue keeps: rooms, tables (unlabelled), menu counts.
    expect((await admin.from("event_rooms").select("room_id").eq("event_id", s.eventId)).data).toHaveLength(1);
    expect((await admin.from("event_layout_elements").select("label").eq("event_id", s.eventId)).data).toEqual([{ label: null }]);
    expect((await admin.from("event_menu_submissions").select("total, allergy_summary, seen_by").eq("event_id", s.eventId)).data).toEqual([
      { total: 80, allergy_summary: null, seen_by: null },
    ]);
  });

  it("removes the couple's support tickets and their threads on every reason, leaving the venue's own tickets (0171)", async () => {
    const venueTicket = await must(
      admin.from("support_tickets").insert({ venue_id: venueId, submitted_by: "venue", name: "Staff", problem: "P", description: "D" }).select("id").single(),
    );
    for (const reason of ["retention", "request"]) {
      const s = await seedEvent(`tkt-${reason}${stamp}`);
      await erase(s.eventId, reason);
      expect((await admin.from("support_tickets").select("id").eq("event_id", s.eventId)).data, reason).toEqual([]);
      expect((await admin.from("support_ticket_messages").select("id").eq("ticket_id", s.ticketId)).data, reason).toEqual([]);
    }
    expect((await admin.from("support_tickets").select("id").eq("id", venueTicket.id)).data).toHaveLength(1);
  });

  it("request erasure also removes the organizer's names and contacts", async () => {
    const s = await seedEvent(`req${stamp}`);
    expect(await erase(s.eventId, "request")).toBe(true);
    expect(await remainingPersonalData(s.eventId, s.checklistId)).toEqual([]);
    expect(await must(admin.from("events").select("couple_names, contact_email, contact_email_2, contact_phone, total_price").eq("id", s.eventId).single())).toEqual({
      couple_names: ERASED_COUPLE_NAMES, contact_email: null, contact_email_2: null, contact_phone: null, total_price: 1000,
    });
  });

  it("a mini-event's reservation keeps name/phone on retention, not on request; its note goes on both (0178)", async () => {
    const kept = await newMiniEvent(`mret${stamp}`);
    await must(admin.from("reservations").update({ note: "Алергија на ореви — Марко" }).eq("event_id", kept));
    await erase(kept, "retention");
    expect(await must(admin.from("reservations").select("guest_name, phone, email, note, room_id").eq("event_id", kept).single())).toEqual({
      guest_name: `Mini mret${stamp}`, phone: "070 999 888", email: null, note: null, room_id: roomId,
    });

    const gone = await newMiniEvent(`mreq${stamp}`);
    await must(admin.from("reservations").update({ note: "Торта од дома" }).eq("event_id", gone));
    await erase(gone, "request");
    expect(await must(admin.from("reservations").select("guest_name, phone, note, room_id").eq("event_id", gone).single())).toEqual({
      guest_name: ERASED_COUPLE_NAMES, phone: "", note: null, room_id: roomId,
    });
  });
});

describe("couple-access end (0170)", () => {
  const today = todayIn();
  const plusDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  it("defaults to 6 months after the event", async () => {
    const { id } = await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Default", event_date: "2030-08-31" }).select("id").single());
    expect(await accessEnd(id)).toBe("2031-02-28");
  });

  it("cancelling ends access 30 days later, or at the normal end if that is earlier; reverting restores it", async () => {
    const far = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Far", event_date: "2030-01-01" }).select("id").single())).id;
    await must(admin.from("events").update({ status: "cancelled" }).eq("id", far));
    expect(await accessEnd(far)).toBe(plusDays(today, 30));
    await must(admin.from("events").update({ status: "confirmed" }).eq("id", far));
    expect((await must(admin.from("events").select("couple_access_until").eq("id", far).single())).couple_access_until).toBeNull();
    expect(await accessEnd(far)).toBe("2030-07-01");

    // Event 6 months ago (+10 days): its normal end, 10 days from now, comes before today + 30.
    const nearDate = plusDays(addMonths(today, -6), 10);
    const near = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Near", event_date: nearDate }).select("id").single())).id;
    await must(admin.from("events").update({ status: "cancelled" }).eq("id", near));
    expect(await accessEnd(near)).toBe(addMonths(nearDate, 6));
    expect(addMonths(nearDate, 6) < plusDays(today, 30)).toBe(true);
  });

  it("an admin extension wins over a cancellation and survives its revert", async () => {
    const id = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Ext", event_date: "2030-01-01" }).select("id").single())).id;
    await must(admin.from("events").update({ couple_access_extended_until: "2031-01-01" }).eq("id", id));
    await must(admin.from("events").update({ status: "cancelled" }).eq("id", id));
    expect(await accessEnd(id)).toBe("2031-01-01");
    await must(admin.from("events").update({ status: "preparation" }).eq("id", id));
    expect(await must(admin.from("events").select("couple_access_until, couple_access_extended_until").eq("id", id).single())).toEqual({
      couple_access_until: null, couple_access_extended_until: "2031-01-01",
    });
  });
});

describe("retention sweep functions (0170, 0178)", () => {
  // Runs inside a rolled-back transaction: the sweep covers the whole shared
  // local database, whose other expired events must not really be erased.
  // lib/privacy/retention.ts lists the due events, then erases each in its
  // own call; here the erase runs only for this test's events.
  it("erases events past their access end, keeps extended/future ones, deletes contact messages older than 6 months", async () => {
    const expired = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Expired", event_date: "2020-01-01" }).select("id").single())).id;
    const extended = (await must(
      admin.from("events").insert({ venue_id: venueId, couple_names: "Extended", event_date: "2020-01-01", couple_access_extended_until: "2099-01-01" }).select("id").single(),
    )).id;
    const cancelledLongAgo = (await must(
      admin.from("events").insert({ venue_id: venueId, couple_names: "Cancelled", event_date: "2099-01-01", couple_access_until: "2020-02-01" }).select("id").single(),
    )).id;
    const future = (await must(admin.from("events").insert({ venue_id: venueId, couple_names: "Future", event_date: "2099-01-01" }).select("id").single())).id;
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    await must(admin.from("contact_submissions").insert({ name: "Old", email: `old-${stamp}@coverage.test`, message: "hi", created_at: old }));
    await must(admin.from("contact_submissions").insert({ name: "New", email: `new-${stamp}@coverage.test`, message: "hi" }));

    await db.query("begin");
    try {
      const { rows: due } = await db.query("select array_agg(id) as ids from public.due_retention_event_ids(100000) as id");
      const dueIds = (due[0].ids ?? []) as string[];
      expect(dueIds).toEqual(expect.arrayContaining([expired, cancelledLongAgo]));
      expect(dueIds).not.toContain(extended);
      expect(dueIds).not.toContain(future);
      for (const id of [expired, cancelledLongAgo]) await db.query("select public.erase_event_personal_data($1, null, 'retention')", [id]);
      const { rows } = await db.query("select public.purge_old_contact_submissions() as n");
      expect(rows[0].n).toBeGreaterThanOrEqual(1);
      const { rows: events } = await db.query(
        "select couple_names, personal_data_erased_at is not null as erased from events where id = any($1) order by couple_names",
        [[expired, extended, cancelledLongAgo, future]],
      );
      // Retention keeps the names; the marker shows which were erased.
      expect(events).toEqual([
        { couple_names: "Cancelled", erased: true },
        { couple_names: "Expired", erased: true },
        { couple_names: "Extended", erased: false },
        { couple_names: "Future", erased: false },
      ]);
      const { rows: contacts } = await db.query("select name from contact_submissions where email like $1", [`%-${stamp}@coverage.test`]);
      expect(contacts).toEqual([{ name: "New" }]);
      const { rows: audit } = await db.query("select actor_type, details from audit_log where event_id = $1 and action = 'event_personal_data_erased'", [expired]);
      expect(audit).toEqual([{ actor_type: "system", details: { reason: "retention" } }]);
    } finally {
      await db.query("rollback");
    }
  });

  it("deletes support tickets closed more than 6 months ago, with their threads; keeps open, reopened and recent ones (0176)", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const ticket = async (problem: string, fields: Record<string, unknown>) =>
      (await must(
        admin.from("support_tickets").insert({ venue_id: venueId, submitted_by: "venue", name: "Staff", problem, description: "D", ...fields }).select("id").single(),
      )).id as string;
    const closedLongAgo = await ticket(`closed-old-${stamp}`, { status: "done", resolved_at: old, last_message_at: old });
    await must(admin.from("support_ticket_messages").insert({ ticket_id: closedLongAgo, author: "admin", body: "Готово." }));
    const closedRecently = await ticket(`closed-new-${stamp}`, { status: "done", resolved_at: recent });
    const openOld = await ticket(`open-old-${stamp}`, { status: "in_progress", created_at: old, last_message_at: old });
    const reopened = await ticket(`reopened-${stamp}`, { status: "in_progress", resolved_at: null, created_at: old });

    await db.query("begin");
    try {
      const { rows } = await db.query("select public.purge_closed_support_tickets() as n");
      expect(rows[0].n).toBeGreaterThanOrEqual(1);
      const { rows: left } = await db.query("select id from support_tickets where id = any($1)", [[closedLongAgo, closedRecently, openOld, reopened]]);
      expect(left.map((r) => r.id).sort()).toEqual([closedRecently, openOld, reopened].sort());
      const { rows: thread } = await db.query("select count(*)::int as n from support_ticket_messages where ticket_id = $1", [closedLongAgo]);
      expect(thread[0].n).toBe(0);
      const { rows: audit } = await db.query(
        "select details from audit_log where action = 'support_tickets_purged' and occurred_at >= now() - interval '1 minute' order by occurred_at desc limit 1",
      );
      expect(audit[0].details).toMatchObject({ months: 6 });
    } finally {
      await db.query("rollback");
    }
    await must(admin.from("support_tickets").delete().in("id", [closedLongAgo, closedRecently, openOld, reopened]));
  });

  it("are callable by the service role only", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const fn of ["due_retention_event_ids", "purge_old_contact_submissions", "purge_closed_support_tickets"]) {
      expect((await anon.rpc(fn)).error, fn).not.toBeNull();
    }
    expect((await anon.rpc("erase_event_personal_data", { p_event_id: venueId })).error).not.toBeNull();
    expect((await anon.rpc("event_access_end", { p_event_id: venueId })).error).not.toBeNull();
  });
});
