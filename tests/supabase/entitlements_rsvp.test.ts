import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as rsvp } from "@/app/api/invite/[slug]/rsvp/route";
import { listAnswers, resolveAnswer } from "@/lib/couple/rsvp-answers";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
let eventId: string;
const slug = `lim${Date.now()}`.slice(0, 20);

function post(fullName: string) {
  return rsvp(new NextRequest(`http://localhost/api/invite/${slug}/rsvp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `rsvp-${Math.random()}` },
    body: JSON.stringify({ full_name: fullName, attending: true }),
  }), { params: { slug } });
}

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `RSVP limit ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "invitation", enabled: true },
    { plan_id: planId, feature_key: "max_guests", enabled: true, limit_value: 1 },
    // A feature_key with no row at all resolves disabled with limit 0 (Task
    // 2.2's controller ruling, tests/supabase/entitlements_resolution.test.ts),
    // not "unlimited" — so max_active_events must be explicitly enabled here,
    // or migration 0049's events trigger would refuse the very first event
    // this fixture creates (0 active events already >= a limit of 0).
    { plan_id: planId, feature_key: "max_active_events", enabled: true },
  ]);
  venueId = (await admin.from("venues").insert({ name: "RSVP Limit Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Lim & It", event_date: "2028-04-01" }).select("id").single()).data!.id;
  await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: slug });
  await admin.from("event_guests").insert({ event_id: eventId, full_name: "Ана" });
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("RSVP under the guest limit (Review Focus)", () => {
  it("still updates a listed guest when the list is full", async () => {
    expect((await post("Ана")).status).toBe(200);
  });
  it("0180: a new guest over the limit gets a neutral message; the answer waits for the couple with the reason", async () => {
    const res = await post("Нов Гостин");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Одговорот не можеше да се зачува. Ве молиме јавете се на младенците.");

    const { data: guests } = await admin.from("event_guests").select("full_name").eq("event_id", eventId);
    expect(guests!.map((g) => g.full_name)).toEqual(["Ана"]);
    const { data: answers } = await admin
      .from("event_rsvp_answers")
      .select("full_name, guest_id, status, match, review_state, review_reason")
      .eq("event_id", eventId)
      .eq("review_state", "pending");
    expect(answers).toEqual([
      { full_name: "Нов Гостин", guest_id: null, status: "confirmed", match: "review", review_state: "pending", review_reason: "guest_limit" },
    ]);
    // The couple's inbox explains it.
    const inbox = await listAnswers(eventId);
    expect(inbox.find((a) => a.reviewState === "pending")).toMatchObject({ fullName: "Нов Гостин", reviewReason: "guest_limit" });
  });

  it("0180: the couple applying it to a listed guest works; as a new guest the limit still applies", async () => {
    const pending = (await listAnswers(eventId)).find((a) => a.reviewState === "pending")!;
    await expect(resolveAnswer(eventId, pending.id, { kind: "new" }, "couple")).rejects.toThrow("Достигнат е лимитот од 1 гости");
    // Put back as pending, then applied to the one guest there is.
    const { data: ana } = await admin.from("event_guests").select("id").eq("event_id", eventId).single();
    const guest = await resolveAnswer(eventId, pending.id, { kind: "guest", guestId: ana!.id }, "couple");
    expect(guest!.rsvp_status).toBe("confirmed");
  });
});
