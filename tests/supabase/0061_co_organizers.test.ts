import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// 0061 (A12): a second login per side of the family. The co-organizer signs in
// with their own username and password; the session remembers who they are.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const RUN = `co${Date.now().toString(36)}`;
let venueId: string;
let eventId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "0061 Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin.from("events").insert({ venue_id: venueId, couple_names: "0061", event_date: "2027-05-01" }).select("id").single();
  eventId = event!.id;
  const { error } = await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: `${RUN}-main`, p_password: "main-password-123" });
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

async function createCo(side: string, username: string, password = "co-password-123") {
  return admin.rpc("create_co_organizer", { p_event_id: eventId, p_side: side, p_username: username, p_password: password });
}

async function login(username: string, password: string) {
  const { data, error } = await admin.rpc("verify_couple_login", { p_username: username, p_password: password });
  if (error) throw error;
  return data[0];
}

describe("0061: co-organizers", () => {
  it("creates one login per side, storing only a bcrypt hash", async () => {
    const { data: id, error } = await createCo("bride", `${RUN}-bride`);
    expect(error).toBeNull();
    const { data: row } = await admin.from("event_co_organizers").select("*").eq("id", id).single();
    expect(row).toMatchObject({ event_id: eventId, side: "bride", username: `${RUN}-bride`, failed_attempts: 0 });
    expect(row!.password_hash).toMatch(/^\$2[aby]\$10\$/); // bcrypt cost 10, as SEC (0045)

    expect((await createCo("bride", `${RUN}-bride2`)).error?.code).toBe("23505"); // one per side
    expect((await createCo("aunt", `${RUN}-aunt`)).error).not.toBeNull();
    expect((await createCo("groom", `${RUN}-short`, "short")).error?.message).toContain("најмалку 10 знаци");
  });

  it("keeps usernames unique across the couple's and co-organizers' logins", async () => {
    expect((await createCo("groom", `${RUN}-main`)).error?.message).toContain("Корисничкото име е зафатено");

    const { data: other } = await admin.from("events").insert({ venue_id: venueId, couple_names: "0061b", event_date: "2027-05-02" }).select("id").single();
    const { error } = await admin.rpc("create_event_credentials", { p_event_id: other!.id, p_username: `${RUN}-bride`, p_password: "main-password-123" });
    expect(error?.message).toContain("Корисничкото име е зафатено");
  });

  it("logs in the couple and a co-organizer, telling them apart", async () => {
    await createCo("groom", `${RUN}-groom`);
    const { data: groom } = await admin.from("event_co_organizers").select("id").eq("username", `${RUN}-groom`).single();

    expect(await login(`${RUN}-main`, "main-password-123")).toEqual({ event_id: eventId, organizer_id: null, side: null, error_code: null });
    expect(await login(`${RUN}-groom`, "co-password-123")).toEqual({ event_id: eventId, organizer_id: groom!.id, side: "groom", error_code: null });
    expect(await login(`${RUN}-groom`, "wrong-password")).toMatchObject({ event_id: null, error_code: "invalid" });
    expect(await login(`${RUN}-nobody`, "whatever-password")).toMatchObject({ event_id: null, error_code: "invalid" });
  });

  it("locks a co-organizer after 5 wrong passwords", async () => {
    const { data: ev } = await admin.from("events").insert({ venue_id: venueId, couple_names: "0061c", event_date: "2027-05-03" }).select("id").single();
    await admin.rpc("create_co_organizer", { p_event_id: ev!.id, p_side: "bride", p_username: `${RUN}-locked`, p_password: "co-password-123" });
    for (let i = 0; i < 5; i++) await login(`${RUN}-locked`, "wrong-password");
    expect(await login(`${RUN}-locked`, "co-password-123")).toMatchObject({ event_id: null, error_code: "locked" });
  });

  it("ends a co-organizer's sessions when they are removed", async () => {
    const { data: ev } = await admin.from("events").insert({ venue_id: venueId, couple_names: "0061d", event_date: "2027-05-04" }).select("id").single();
    const { data: id } = await admin.rpc("create_co_organizer", { p_event_id: ev!.id, p_side: "bride", p_username: `${RUN}-gone`, p_password: "co-password-123" });
    await admin.from("couple_sessions").insert({ token: `${RUN}-tok`, event_id: ev!.id, organizer_id: id, expires_at: new Date(Date.now() + 86_400_000).toISOString() });

    await admin.from("event_co_organizers").delete().eq("id", id);
    const { data: sessions } = await admin.from("couple_sessions").select("token").eq("token", `${RUN}-tok`);
    expect(sessions).toEqual([]);
  });

  it("removes co-organizers when the event's personal data is erased", async () => {
    const { data: ev } = await admin.from("events").insert({ venue_id: venueId, couple_names: "0061e", event_date: "2027-05-05" }).select("id").single();
    await admin.rpc("create_co_organizer", { p_event_id: ev!.id, p_side: "groom", p_username: `${RUN}-erase`, p_password: "co-password-123" });

    await admin.from("events").update({ personal_data_erased_at: new Date().toISOString() }).eq("id", ev!.id);
    const { data } = await admin.from("event_co_organizers").select("id").eq("event_id", ev!.id);
    expect(data).toEqual([]);
  });

  it("is not reachable by the anon or authenticated roles", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("event_co_organizers").select("*")).error).not.toBeNull();
    expect((await anon.rpc("verify_couple_login", { p_username: "x", p_password: "y" })).error).not.toBeNull();
    expect((await anon.rpc("create_co_organizer", { p_event_id: eventId, p_side: "bride", p_username: "x", p_password: "long-enough-pw" })).error).not.toBeNull();
  });
});
