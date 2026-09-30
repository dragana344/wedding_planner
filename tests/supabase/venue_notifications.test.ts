import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listVenueNotifications } from "@/lib/venue/notifications";

// S3 task 11 (B9): "Известувања" = the venue's recent audit log and new events,
// read as the signed-in staff user (RLS: own venue only).

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
  it("lists the venue's own RSVP changes, logins and new events, newest first", async () => {
    const list = await listVenueNotifications(staff, venueA);
    expect(list.map((n) => n.kind).sort()).toEqual(["credentials_created", "event_created", "rsvp_changed"]);
    const rsvp = list.find((n) => n.kind === "rsvp_changed")!;
    expect(rsvp).toMatchObject({ eventId: eventA, title: "Одговор на поканата: Ана & Марко", detail: "Без одговор → Доаѓа" });
    expect(list.find((n) => n.kind === "event_created")!.title).toBe("Нов настан: Ана & Марко");
    const times = list.map((n) => n.at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(JSON.stringify(list)).not.toContain("Туѓ пар");
  });

  it("respects the limit", async () => {
    expect(await listVenueNotifications(staff, venueA, 2)).toHaveLength(2);
  });
});
