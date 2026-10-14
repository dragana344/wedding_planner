// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { submitVenueSupportTicket, listVenueSupportTickets } from "@/lib/venue/support";
import { submitCoupleSupportTicket, listCoupleSupportTickets } from "@/lib/couple/support";

const requireAdmin = vi.fn(async () => ({ adminUserId: "a", requestId: null }));
vi.mock("@/lib/admin/guard", () => ({ requireAdmin }));

const { listSupportTickets } = await import("@/lib/admin/queries");
const { supportTicketActionCore } = await import("@/lib/admin/support-actions-core");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let eventId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Support Venue ${stamp}` }).select("id").single()).data!.id;
  eventId = (
    await admin.from("events").insert({ venue_id: venueId, couple_names: "Ана и Петар", event_date: "2028-06-01" }).select("id").single()
  ).data!.id;
});
afterAll(async () => {
  await admin.from("events").delete().eq("id", eventId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("support tickets", () => {
  it("a venue submits a ticket, pending by default, and sees it in its own list", async () => {
    const ticket = await submitVenueSupportTicket(venueId, { name: "Марко", problem: "Не работи", description: "Детали за проблемот" });
    expect(ticket).toMatchObject({ venueId, eventId: null, submittedBy: "venue", status: "pending", adminComment: null });

    const tickets = await listVenueSupportTickets(venueId);
    expect(tickets.map((t) => t.id)).toContain(ticket.id);
  });

  it("a couple submits a ticket, resolving the venue from their event automatically", async () => {
    const ticket = await submitCoupleSupportTicket(eventId, { name: "Ана", problem: "Прашање за мени", description: "Детали" });
    expect(ticket).toMatchObject({ venueId, eventId, submittedBy: "couple", status: "pending" });

    const tickets = await listCoupleSupportTickets(eventId);
    expect(tickets.map((t) => t.id)).toContain(ticket.id);
    // A venue's own list never mixes in another venue's or the admin's data,
    // but it does include couple-submitted tickets for the same venue.
    expect((await listVenueSupportTickets(venueId)).map((t) => t.id)).toContain(ticket.id);
  });

  it("admin sees both tickets, with the venue name and (for the couple one) the couple's names, filterable by status", async () => {
    const all = await listSupportTickets({});
    const venueTicket = all.find((t) => t.venueId === venueId && t.submittedBy === "venue");
    const coupleTicket = all.find((t) => t.venueId === venueId && t.submittedBy === "couple");
    expect(venueTicket?.venueName).toBe(`Support Venue ${stamp}`);
    expect(coupleTicket?.coupleNames).toBe("Ана и Петар");

    const pending = await listSupportTickets({ status: "pending" });
    expect(pending.every((t) => t.status === "pending")).toBe(true);
  });

  it("admin marks a ticket done with a comment, then reopens it", async () => {
    const ticket = await submitVenueSupportTicket(venueId, { name: "Марко", problem: "Друг проблем", description: "Детали" });
    await supportTicketActionCore.setStatus({ id: ticket.id, status: "done", adminComment: "Решено телефонски" }, { adminUserId: "a", requestId: null });

    let row = (await admin.from("support_tickets").select("status, admin_comment, resolved_at").eq("id", ticket.id).single()).data!;
    expect(row.status).toBe("done");
    expect(row.admin_comment).toBe("Решено телефонски");
    expect(row.resolved_at).not.toBeNull();

    await supportTicketActionCore.setStatus({ id: ticket.id, status: "pending" }, { adminUserId: "a", requestId: null });
    row = (await admin.from("support_tickets").select("status, admin_comment, resolved_at").eq("id", ticket.id).single()).data!;
    expect(row.status).toBe("pending");
    expect(row.resolved_at).toBeNull();
    // Omitting adminComment clears it rather than leaving the old one stale.
    expect(row.admin_comment).toBeNull();
  });

  it("refuses the admin list when the admin guard refuses", async () => {
    const refusal = new Error("Admin access required.");
    requireAdmin.mockRejectedValueOnce(refusal);
    await expect(listSupportTickets({})).rejects.toBe(refusal);
  });
});
