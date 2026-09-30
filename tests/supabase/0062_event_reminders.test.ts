import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// 0062 (A10): one reminder per event, 15 days before at 10:00 Skopje unless
// the couple moves it; due_event_reminders() says which events are due now.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
let venueId: string;

beforeAll(async () => {
  const { data } = await admin.from("venues").insert({ name: "0062 Venue" }).select("id").single();
  venueId = data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

async function newEvent(fields: Record<string, unknown>) {
  const { data, error } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "0062", ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

async function due(now: string): Promise<{ event_id: string; send_at: string }[]> {
  const { data, error } = await admin.rpc("due_event_reminders", { p_now: now });
  if (error) throw error;
  return data;
}

describe("0062: event reminders", () => {
  it("defaults to 15 days before the event at 10:00 Skopje time", async () => {
    const { data, error } = await admin.rpc("default_reminder_at", { p_event_date: "2027-07-20" });
    expect(error).toBeNull();
    // 2027-07-05 10:00 CEST (UTC+2)
    expect(new Date(data as string).toISOString()).toBe("2027-07-05T08:00:00.000Z");
  });

  it("is due from the default time on, and not before", async () => {
    const id = await newEvent({ event_date: "2027-07-20", created_at: "2027-01-01T00:00:00Z" });
    expect((await due("2027-07-05T07:59:00Z")).map((r) => r.event_id)).not.toContain(id);
    const now = await due("2027-07-05T08:00:00Z");
    expect(now.find((r) => r.event_id === id)).toEqual({ event_id: id, send_at: expect.any(String) });
  });

  it("follows the couple's own time, and skips sent, cancelled, past, erased and cancelled-event reminders", async () => {
    const custom = await newEvent({ event_date: "2027-08-20", created_at: "2027-01-01T00:00:00Z" });
    await admin.from("event_reminders").insert({ event_id: custom, send_at: "2027-08-18T16:00:00Z" });
    const sent = await newEvent({ event_date: "2027-08-20", created_at: "2027-01-01T00:00:00Z" });
    await admin.from("event_reminders").insert({ event_id: sent, send_at: "2027-08-01T08:00:00Z", status: "sent" });
    const off = await newEvent({ event_date: "2027-08-20", created_at: "2027-01-01T00:00:00Z" });
    await admin.from("event_reminders").insert({ event_id: off, send_at: "2027-08-01T08:00:00Z", status: "cancelled" });
    const cancelledEvent = await newEvent({ event_date: "2027-08-20", created_at: "2027-01-01T00:00:00Z", status: "cancelled" });
    const erased = await newEvent({ event_date: "2027-08-20", created_at: "2027-01-01T00:00:00Z", personal_data_erased_at: "2027-02-01T00:00:00Z" });

    const at = (iso: string) => due(iso).then((rows) => rows.map((r) => r.event_id));
    expect(await at("2027-08-10T08:00:00Z")).not.toContain(custom); // default passed, custom not yet
    expect(await at("2027-08-18T16:00:00Z")).toContain(custom);
    const later = await at("2027-08-19T00:00:00Z");
    for (const id of [sent, off, cancelledEvent, erased]) expect(later).not.toContain(id);
    expect(await at("2027-08-21T08:00:00Z")).not.toContain(custom); // the day after the event
  });

  it("offers a reminder again when the run that claimed it died", async () => {
    const id = await newEvent({ event_date: "2027-12-20", created_at: "2027-01-01T00:00:00Z" });
    await admin.from("event_reminders").insert({ event_id: id, send_at: "2027-12-05T09:00:00Z", status: "sending", updated_at: "2027-12-05T09:00:00Z" });
    expect((await due("2027-12-05T09:10:00Z")).map((r) => r.event_id)).not.toContain(id);
    expect((await due("2027-12-05T09:31:00Z")).map((r) => r.event_id)).toContain(id);
  });

  it("does not remind for an event booked after its default reminder time", async () => {
    const late = await newEvent({ event_date: "2027-09-10", created_at: "2027-09-01T00:00:00Z" });
    expect((await due("2027-09-02T00:00:00Z")).map((r) => r.event_id)).not.toContain(late);
  });

  it("claims a due reminder once, so two cron runs cannot both send it", async () => {
    const id = await newEvent({ event_date: "2027-10-20", created_at: "2027-01-01T00:00:00Z" });
    const claim = () => admin.rpc("claim_event_reminder", { p_event_id: id, p_now: "2027-10-05T09:00:00Z" });
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a.data, b.data].sort()).toEqual([false, true]);
    const { data: row } = await admin.from("event_reminders").select("status").eq("event_id", id).single();
    expect(row!.status).toBe("sending");
  });

  it("validates status and keeps one reminder per event; guests get reminder_sent_at", async () => {
    const id = await newEvent({ event_date: "2027-11-20" });
    expect((await admin.from("event_reminders").insert({ event_id: id, send_at: "2027-11-01T08:00:00Z", status: "maybe" })).error?.code).toBe("23514");
    await admin.from("event_reminders").insert({ event_id: id, send_at: "2027-11-01T08:00:00Z" });
    expect((await admin.from("event_reminders").insert({ event_id: id, send_at: "2027-11-02T08:00:00Z" })).error?.code).toBe("23505");
    const { data: guest } = await admin.from("event_guests").insert({ event_id: id, full_name: "Г" }).select("reminder_sent_at").single();
    expect(guest!.reminder_sent_at).toBeNull();
  });

  it("is not reachable by anon", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("event_reminders").select("*")).error).not.toBeNull();
    expect((await anon.rpc("due_event_reminders", { p_now: "2027-01-01T00:00:00Z" })).error).not.toBeNull();
    expect((await anon.rpc("claim_event_reminder", { p_event_id: venueId, p_now: "2027-01-01T00:00:00Z" })).error).not.toBeNull();
  });
});
