import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listVenueNotifications } from "@/lib/venue/notifications";
import { markSeen } from "@/lib/changes/server";

// S3 task 11 (B9): "Известувања" = the venue's recent audit log and new events,
// read as the signed-in staff user (RLS: own venue only), plus the couple's
// change marks (service-role, scoped to the venue).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const RUN = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "notifications-password-123";

let venueA: string;
let venueB: string;
let eventA: string;
let userId: string;
let staff: SupabaseClient;

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

beforeAll(async () => {
  venueA = (await must(admin.from("venues").insert({ name: `${RUN} A` }).select("id").single())).id;
  venueB = (await must(admin.from("venues").insert({ name: `${RUN} B` }).select("id").single())).id;
  eventA = (await must(admin.from("events").insert({ venue_id: venueA, couple_names: "Ана & Марко", event_date: "2027-06-12" }).select("id").single())).id;
  const eventB = (await must(admin.from("events").insert({ venue_id: venueB, couple_names: "Туѓ пар", event_date: "2027-06-13" }).select("id").single())).id;
  await must(admin.from("audit_log").insert([
    { actor_type: "guest", action: "public_rsvp", venue_id: venueA, event_id: eventA, target_id: eventA, details: { previous_status: "pending", new_status: "confirmed" } },
    { actor_type: "staff", action: "privacy_export", venue_id: venueA, event_id: eventA, target_id: eventA, details: {} },
    { actor_type: "staff", action: "couple_credentials_created", venue_id: venueA, event_id: eventA, target_id: eventA, details: {} },
    { actor_type: "guest", action: "public_rsvp", venue_id: venueB, event_id: eventB, target_id: eventB, details: {} },
  ]));
  const email = `${RUN}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  userId = data.user!.id;
  await must(admin.from("venue_staff").insert({ user_id: userId, venue_id: venueA }));
  staff = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await staff.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw signIn.error;
}, 60_000);

afterAll(async () => {
  await staff?.auth.signOut();
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("venues").delete().in("id", [venueA, venueB]);
});

describe("venue notifications", () => {
  it("lists the venue's own logins, exports and new events, newest first, with no RSVP items", async () => {
    const list = await listVenueNotifications(staff, venueA);
    expect(list.map((n) => n.kind).sort()).toEqual(["credentials_created", "data_exported", "event_created"]);
    expect(list.find((n) => n.kind === "event_created")).toMatchObject({ title: "Нов настан: Ана & Марко", color: "blue", unseen: false });
    expect(list.find((n) => n.kind === "credentials_created")!.color).toBe("grey");
    expect(list.find((n) => n.kind === "data_exported")!.color).toBe("red");
    const times = list.map((n) => n.at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(JSON.stringify(list)).not.toContain("Туѓ пар");
  });

  it("respects the limit", async () => {
    expect(await listVenueNotifications(staff, venueA, 2)).toHaveLength(2);
  });

  it("an explicit range narrows results to just that window", async () => {
    const old = await must(
      admin
        .from("audit_log")
        .insert({
          actor_type: "staff",
          action: "couple_password_regenerated",
          venue_id: venueA,
          event_id: eventA,
          target_id: eventA,
          occurred_at: "2020-03-15T10:00:00Z",
          details: {},
        })
        .select("id")
        .single()
    );
    const ranged = await listVenueNotifications(staff, venueA, 50, { from: "2020-03-01T00:00:00Z", to: "2020-03-31T23:59:59Z" });
    expect(ranged).toHaveLength(1);
    expect(ranged[0].id).toBe(`a${old.id}`);

    // A range that doesn't cover it excludes it, same as any other filter.
    const outsideRange = await listVenueNotifications(staff, venueA, 50, { from: "2021-01-01T00:00:00Z", to: "2021-01-31T23:59:59Z" });
    expect(outsideRange.map((n) => n.id)).not.toContain(`a${old.id}`);
  });
});

describe("venue notifications: the couple's changes and menu numbers", () => {
  it("shows couple changes yellow and unseen until Видено (the venue is never subject to the couple's first login)", async () => {
    // No record_couple_first_login: the venue side counts every couple change,
    // same as the "!" badge and the event window.
    await must(admin.rpc("couple_set_guest_count", { p_event_id: eventA, p_count: 90, p_changed_by: null }));
    expect((await listVenueNotifications(staff, venueA)).filter((n) => n.kind === "couple_change")).toHaveLength(1);

    await must(admin.rpc("couple_set_guest_count", { p_event_id: eventA, p_count: 100, p_changed_by: null }));
    await must(admin.rpc("couple_set_contact_info", { p_event_id: eventA, p_email: "tajna@example.com", p_email_2: null, p_phone: "070123456", p_changed_by: null }));

    const list = (await listVenueNotifications(staff, venueA)).filter((n) => n.kind === "couple_change");
    const count = list.find((n) => n.title === "Број на гости · Ана & Марко" && n.detail === "90 → 100")!;
    expect(count).toMatchObject({ color: "yellow", unseen: true, eventId: eventA });
    expect(count.seenAction).toMatchObject({ eventId: eventA, section: "guest_count", upTo: count.at });
    const contact = list.find((n) => n.title === "Контакт · Ана & Марко")!;
    expect(contact.detail).toBe("Контакт е променет");
    expect(JSON.stringify(list)).not.toContain("tajna@example.com");

    await markSeen(eventA, "venue", "guest_count", count.seenAction!.upTo, null);
    const after = (await listVenueNotifications(staff, venueA)).filter((n) => n.kind === "couple_change");
    expect(after.find((n) => n.id === count.id)!.unseen).toBe(false);
    expect(after.find((n) => n.id === count.id)!.seenAction).toBeUndefined();
    expect(after.find((n) => n.id === contact.id)!.unseen).toBe(true);
  });

  it("shows an auto-sent submission green with the incomplete text, unseen until seen", async () => {
    await must(admin.rpc("insert_auto_menu_submission", { p_event_id: eventA, p_counts: {}, p_titles: {}, p_total: 70, p_unanswered: 12 }));
    const item = (await listVenueNotifications(staff, venueA)).find((n) => n.kind === "menu_numbers")!;
    expect(item).toMatchObject({ color: "green", unseen: true, title: "Бројки за мени · Ана & Марко" });
    expect(item.detail).toContain("Испратено автоматски — непотполно");
    expect(item.detail).toContain("12 гости без одговор");
    expect(item.seenAction).toMatchObject({ eventId: eventA, section: "menu_numbers" });
    expect(item.seenAction!.submissionId).toBeTruthy();

    await must(admin.from("event_menu_submissions").update({ seen_at: new Date().toISOString(), seen_by: "Мена" }).eq("id", item.seenAction!.submissionId!).select("id"));
    const after = (await listVenueNotifications(staff, venueA)).find((n) => n.kind === "menu_numbers")!;
    expect(after.unseen).toBe(false);
  });
});

describe("venue notifications: scoped to the venue", () => {
  it("never shows another venue's couple changes or menu numbers", async () => {
    const other = (await must(admin.from("events").insert({ venue_id: venueB, couple_names: "Туѓи промени", event_date: "2027-07-01" }).select("id").single())).id;
    await must(admin.rpc("couple_set_guest_count", { p_event_id: other, p_count: 55, p_changed_by: null }));
    await must(admin.rpc("insert_auto_menu_submission", { p_event_id: other, p_counts: {}, p_titles: {}, p_total: 33, p_unanswered: 1 }));
    const list = await listVenueNotifications(staff, venueA, 200);
    expect(list.some((n) => n.eventId === other)).toBe(false);
    expect(JSON.stringify(list)).not.toContain("Туѓи промени");
  });
});

describe("venue notifications: colour filter runs before the limit", () => {
  it("returns an older red item even when more than `limit` newer items have other colours", async () => {
    await must(admin.from("audit_log").insert({ actor_type: "staff", action: "privacy_export", venue_id: venueA, event_id: eventA, target_id: eventA, occurred_at: "2019-01-01T10:00:00Z", details: {} }));
    await must(admin.from("audit_log").insert(
      Array.from({ length: 4 }, (_, i) => ({ actor_type: "staff", action: "couple_password_regenerated", venue_id: venueA, event_id: eventA, target_id: eventA, occurred_at: `2025-01-0${i + 1}T10:00:00Z`, details: {} })),
    ));
    const unfiltered = await listVenueNotifications(staff, venueA, 3);
    expect(unfiltered.some((n) => n.at.startsWith("2019"))).toBe(false);
    const reds = await listVenueNotifications(staff, venueA, 3, undefined, "red");
    expect(reds.length).toBeGreaterThan(0);
    expect(reds.every((n) => n.color === "red")).toBe(true);
    expect(reds.some((n) => n.at.startsWith("2019"))).toBe(true);
  });

  it("keeps older couple changes (yellow) when more than `limit` newer green items exist, and the mirror", async () => {
    // eventA already has a couple change from the earlier test (recent, so make the submissions newer than it).
    const base = Date.now() + 60_000;
    await must(admin.from("event_menu_submissions").insert(
      Array.from({ length: 4 }, (_, i) => ({ event_id: eventA, sent_by: "Младенците", counts: {}, menu_titles: {}, total: i, source: "couple", sent_at: new Date(base + i * 1000).toISOString() })),
    ));
    const yellow = await listVenueNotifications(staff, venueA, 2, undefined, "yellow");
    expect(yellow).toHaveLength(2);
    expect(yellow.every((n) => n.color === "yellow")).toBe(true);
    const green = await listVenueNotifications(staff, venueA, 2, undefined, "green");
    expect(green).toHaveLength(2);
    expect(green.every((n) => n.color === "green")).toBe(true);
  });
});
