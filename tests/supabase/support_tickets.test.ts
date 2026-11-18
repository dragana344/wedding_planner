// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { submitVenueSupportTicket, listVenueSupportTickets } from "@/lib/venue/support";
import { submitCoupleSupportTicket, listCoupleSupportTickets } from "@/lib/couple/support";
import { getRequesterThread, replyAsRequester } from "@/lib/support/tickets";

const requireAdmin = vi.fn(async () => ({ adminUserId: "a", requestId: null }));
vi.mock("@/lib/admin/guard", () => ({ requireAdmin }));

const { listInbox, getInboxTicket, getAdminBadgeCounts, getContactMessage } = await import("@/lib/admin/queries");
const { supportTicketActionCore } = await import("@/lib/admin/support-actions-core");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let otherVenueId: string;
let eventId: string;
let adminUserId: string;
const ctx = () => ({ adminUserId, requestId: null });

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Support Venue ${stamp}` }).select("id").single()).data!.id;
  otherVenueId = (await admin.from("venues").insert({ name: `Other Support Venue ${stamp}` }).select("id").single()).data!.id;
  eventId = (
    await admin.from("events").insert({ venue_id: venueId, couple_names: "Ана и Петар", event_date: "2028-06-01" }).select("id").single()
  ).data!.id;
  // support_ticket_messages.admin_user_id references a real Auth user.
  adminUserId = (
    await admin.auth.admin.createUser({ email: `support-admin-${stamp}@test.local`, password: "support-admin-1", email_confirm: true, app_metadata: { role: "platform_admin" } })
  ).data.user!.id;
});
afterAll(async () => {
  await admin.from("events").delete().eq("id", eventId);
  await admin.from("venues").delete().in("id", [venueId, otherVenueId]);
  await admin.auth.admin.deleteUser(adminUserId);
});

describe("support tickets: requester side", () => {
  it("a venue submits a ticket, new and waiting for the team, and sees it in its own list", async () => {
    const ticket = await submitVenueSupportTicket(venueId, { name: "Марко", problem: "Не работи", description: "Детали за проблемот" });
    expect(ticket).toMatchObject({ venueId, eventId: null, submittedBy: "venue", status: "new", requesterUnread: false });
    expect((await listVenueSupportTickets(venueId)).map((t) => t.id)).toContain(ticket.id);
  });

  it("a couple submits a ticket against their event's venue; the venue never sees the couple's ticket", async () => {
    const ticket = await submitCoupleSupportTicket(eventId, { name: "Ана", problem: "Прашање за мени", description: "Детали" });
    expect(ticket).toMatchObject({ venueId, eventId, submittedBy: "couple", status: "new" });
    expect((await listCoupleSupportTickets(eventId)).map((t) => t.id)).toContain(ticket.id);
    expect((await listVenueSupportTickets(venueId)).map((t) => t.id)).not.toContain(ticket.id);
    expect(await getRequesterThread({ venueId }, ticket.id)).toBeNull();
    expect(await replyAsRequester({ venueId }, ticket.id, "туѓо")).toBeNull();
  });

  it("another venue can neither read nor reply to a venue's ticket", async () => {
    const ticket = await submitVenueSupportTicket(venueId, { name: "Марко", problem: "Приватно", description: "Детали" });
    expect(await getRequesterThread({ venueId: otherVenueId }, ticket.id)).toBeNull();
    expect(await replyAsRequester({ venueId: otherVenueId }, ticket.id, "туѓо")).toBeNull();
  });
});

describe("support tickets: the conversation", () => {
  it("admin reply → requester sees it as unread → opening clears it → requester follow-up puts it back in the queue", async () => {
    const ticket = await submitVenueSupportTicket(venueId, { name: "Марко", problem: "Разговор", description: "Првa порака" });

    await supportTicketActionCore.reply({ id: ticket.id, body: "Проверуваме." }, ctx());
    let row = (await admin.from("support_tickets").select("status, awaiting_admin, requester_unread").eq("id", ticket.id).single()).data!;
    // Replying to a new ticket starts it.
    expect(row).toEqual({ status: "in_progress", awaiting_admin: false, requester_unread: true });
    expect((await listVenueSupportTickets(venueId)).find((t) => t.id === ticket.id)?.requesterUnread).toBe(true);

    const thread = await getRequesterThread({ venueId }, ticket.id);
    expect(thread!.messages.map((m) => [m.author, m.body])).toEqual([["admin", "Проверуваме."]]);
    expect(thread!.ticket.requesterUnread).toBe(false);
    expect((await admin.from("support_tickets").select("requester_unread").eq("id", ticket.id).single()).data!.requester_unread).toBe(false);

    const result = await replyAsRequester({ venueId }, ticket.id, "Фала, уште еден детал.");
    expect(result!.message).toMatchObject({ author: "requester", body: "Фала, уште еден детал." });
    expect(result!.ticket.status).toBe("in_progress");
    row = (await admin.from("support_tickets").select("status, awaiting_admin, requester_unread").eq("id", ticket.id).single()).data!;
    expect(row.awaiting_admin).toBe(true);

    const adminView = await getInboxTicket(ticket.id);
    expect(adminView!.messages.map((m) => m.author)).toEqual(["admin", "requester"]);
    expect(adminView!.messages[0].adminEmail).toBe(`support-admin-${stamp}@test.local`);
  });

  it("a requester's reply on a solved ticket reopens it", async () => {
    const ticket = await submitCoupleSupportTicket(eventId, { name: "Ана", problem: "Решено?", description: "Детали" });
    await supportTicketActionCore.setStatus({ id: ticket.id, status: "done" }, ctx());
    let row = (await admin.from("support_tickets").select("status, resolved_at, awaiting_admin").eq("id", ticket.id).single()).data!;
    expect(row.status).toBe("done");
    expect(row.resolved_at).not.toBeNull();
    expect(row.awaiting_admin).toBe(false);

    await replyAsRequester({ eventId }, ticket.id, "Пак не работи.");
    row = (await admin.from("support_tickets").select("status, resolved_at, awaiting_admin").eq("id", ticket.id).single()).data!;
    expect(row).toEqual({ status: "in_progress", resolved_at: null, awaiting_admin: true });
  });

  it("reopening to 'new' puts the ticket back in the team's queue", async () => {
    const ticket = await submitVenueSupportTicket(venueId, { name: "Марко", problem: "Повторно", description: "Детали" });
    await supportTicketActionCore.setStatus({ id: ticket.id, status: "in_progress" }, ctx());
    expect((await admin.from("support_tickets").select("awaiting_admin").eq("id", ticket.id).single()).data!.awaiting_admin).toBe(false);
    await supportTicketActionCore.setStatus({ id: ticket.id, status: "new" }, ctx());
    expect((await admin.from("support_tickets").select("awaiting_admin").eq("id", ticket.id).single()).data!.awaiting_admin).toBe(true);
  });

  it("refuses an admin reply to a ticket that doesn't exist", async () => {
    await expect(supportTicketActionCore.reply({ id: "00000000-0000-4000-8000-000000000000", body: "x" }, ctx())).rejects.toThrow("Барањето не е пронајдено.");
  });
});

describe("support tickets: the admin inbox", () => {
  it("lists public messages and tickets together, filterable by source and status, with venue and couple names", async () => {
    await admin.from("contact_submissions").insert({ name: `Inbox Sender ${stamp}`, email: "inbox@test.local", message: "Здраво од формата" });

    const all = await listInbox({});
    const venueRow = all.find((r) => r.kind === "ticket" && r.venueName === `Support Venue ${stamp}` && r.source === "venue");
    const coupleRow = all.find((r) => r.kind === "ticket" && r.venueName === `Support Venue ${stamp}` && r.source === "couple");
    expect(venueRow).toBeDefined();
    expect(coupleRow?.coupleNames).toBe("Ана и Петар");
    expect(all.some((r) => r.kind === "contact" && r.from === `Inbox Sender ${stamp}`)).toBe(true);
    // Newest activity first.
    expect(all.map((r) => r.lastActivityAt)).toEqual([...all.map((r) => r.lastActivityAt)].sort().reverse());

    expect((await listInbox({ source: "public" })).every((r) => r.kind === "contact")).toBe(true);
    expect((await listInbox({ source: "couple" })).every((r) => r.source === "couple")).toBe(true);
    expect((await listInbox({ status: "done" })).every((r) => r.status === "done")).toBe(true);
    // An unknown filter value falls back to "all" rather than matching nothing.
    expect((await listInbox({ source: "bogus", status: "bogus" })).length).toBe(all.length);

    await admin.from("contact_submissions").delete().eq("name", `Inbox Sender ${stamp}`);
  });

  it("marks a demo request (0173) in the inbox subject and on the message", async () => {
    const { data } = await admin
      .from("contact_submissions")
      .insert({ name: `Demo Sender ${stamp}`, email: "demo@test.local", message: "Локал: Езеро\nГрад: Охрид\nТелефон: 070", kind: "demo" })
      .select("id")
      .single();
    const row = (await listInbox({ source: "public" })).find((r) => r.id === data!.id);
    expect(row?.subject).toBe("Барање за демо · Локал: Езеро · Град: Охрид · Телефон: 070");
    expect((await getContactMessage(data!.id))?.kind).toBe("demo");
    await admin.from("contact_submissions").delete().eq("id", data!.id);
  });

  it("the inbox badge counts new public messages plus tickets waiting for an answer", async () => {
    const before = await getAdminBadgeCounts(adminUserId);
    const ticket = await submitVenueSupportTicket(venueId, { name: "Марко", problem: "Брои", description: "Детали" });
    expect((await getAdminBadgeCounts(adminUserId)).inbox).toBe(before.inbox + 1);
    await supportTicketActionCore.reply({ id: ticket.id, body: "Одговор" }, ctx());
    expect((await getAdminBadgeCounts(adminUserId)).inbox).toBe(before.inbox);
  });

  it("refuses the inbox when the admin guard refuses", async () => {
    const refusal = new Error("Admin access required.");
    requireAdmin.mockRejectedValueOnce(refusal);
    await expect(listInbox({})).rejects.toBe(refusal);
  });
});
