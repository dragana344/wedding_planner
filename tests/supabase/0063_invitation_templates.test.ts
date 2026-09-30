import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { BASIC_TEMPLATE_IDS } from "@/lib/entitlements/features";

// 0063 (A13): three basic invitation templates, three premium behind
// `invitation_all_templates`. The database and the app share one list.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let planId: string;
let venueId: string;
let eventId: string;

beforeAll(async () => {
  planId = (await admin.from("plans").insert({ name: `Templates ${Date.now()}` }).select("id").single()).data!.id;
  await admin.from("plan_features").insert([
    { plan_id: planId, feature_key: "invitation", enabled: true },
    { plan_id: planId, feature_key: "max_active_events", enabled: true },
    { plan_id: planId, feature_key: "invitation_all_templates", enabled: false },
  ]);
  venueId = (await admin.from("venues").insert({ name: "Templates Venue", plan_id: planId }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "T & T", event_date: "2028-05-01" }).select("id").single()).data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("0063: basic vs premium invitation templates", () => {
  it("keeps the database's basic list equal to the app's", async () => {
    const { data, error } = await admin.rpc("basic_invitation_templates");
    expect(error).toBeNull();
    expect([...(data as string[])].sort()).toEqual([...BASIC_TEMPLATE_IDS].sort());
    expect([...BASIC_TEMPLATE_IDS].sort()).toEqual(["classic-minimal", "elegant-gold", "romantic-floral"]);
  });

  it("lets a plan without all templates use the three basic ones, not a premium one", async () => {
    const slug = `tpl${Date.now().toString(36)}`;
    const { error: insertError } = await admin.from("event_invitations").insert({ event_id: eventId, template_id: "classic-minimal", public_slug: slug });
    expect(insertError).toBeNull();
    expect((await admin.from("event_invitations").update({ template_id: "elegant-gold" }).eq("event_id", eventId)).error).toBeNull();
    const premium = await admin.from("event_invitations").update({ template_id: "modern-watercolor" }).eq("event_id", eventId);
    expect(premium.error?.message).toContain("Оваа функција не е вклучена во вашиот пакет.");
  });
});
