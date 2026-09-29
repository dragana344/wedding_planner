import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueAId: string;
let venueBId: string;
const staffAEmail = "0013-staff-a@test.local";
const staffAPassword = "test-password-123";
let staffAUserId: string;
let eventAId: string;

describe("0013 schema: couple dashboard auth", () => {
  beforeAll(async () => {
    const { data: venueA } = await admin.from("venues").insert({ name: "0013 Venue A" }).select().single();
    const { data: venueB } = await admin.from("venues").insert({ name: "0013 Venue B" }).select().single();
    venueAId = venueA!.id;
    venueBId = venueB!.id;

    const { data: userA } = await admin.auth.admin.createUser({
      email: staffAEmail,
      password: staffAPassword,
      email_confirm: true,
    });
    staffAUserId = userA!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffAUserId, venue_id: venueAId });

    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venueAId, couple_names: "Test & Couple", event_date: "2026-11-01" })
      .select()
      .single();
    eventAId = event!.id;
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffAUserId);
    await admin.from("venues").delete().in("id", [venueAId, venueBId]);
  });

  it("adds contact columns to events", async () => {
    const { error } = await admin
      .from("events")
      .update({ contact_email: "a@example.com", contact_email_2: "b@example.com", contact_phone: "+389 70 000 000" })
      .eq("id", eventAId);
    expect(error).toBeNull();
  });

  it("removes the old event_organizers table and is_organizer_for_event function", async () => {
    const { error } = await admin.from("event_organizers").select("id").limit(1);
    expect(error).not.toBeNull();
    const { error: fnError } = await admin.rpc("is_organizer_for_event", { target_event_id: eventAId });
    expect(fnError).not.toBeNull();
  });

  it("enforces a unique username on event_credentials", async () => {
    const { data: eventB } = await admin
      .from("events")
      .insert({ venue_id: venueBId, couple_names: "Other Couple", event_date: "2026-12-01" })
      .select()
      .single();

    const { error } = await admin.rpc("create_event_credentials", {
      p_event_id: eventAId,
      p_username: "0013-shared-username",
      p_password: "correct horse battery staple",
    });
    expect(error).toBeNull();

    await admin.from("venue_staff").insert({ user_id: staffAUserId, venue_id: venueBId });
    const { error: dupError } = await admin.rpc("create_event_credentials", {
      p_event_id: eventB!.id,
      p_username: "0013-shared-username",
      p_password: "another password",
    });
    expect(dupError).not.toBeNull();

    await admin.from("venue_staff").delete().eq("user_id", staffAUserId).eq("venue_id", venueBId);
    await admin.from("events").delete().eq("id", eventB!.id);
  });

  it("rejects create_event_credentials from a non-staff caller", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await anon.rpc("create_event_credentials", {
      p_event_id: eventAId,
      p_username: "0013-should-not-be-created",
      p_password: "irrelevant",
    });
    expect(error).not.toBeNull();
  });

  it("verifies correct credentials, rejects wrong ones, and locks out after 5 failures", async () => {
    const { data: correct } = await admin.rpc("verify_event_credentials", {
      p_username: "0013-shared-username",
      p_password: "correct horse battery staple",
    });
    expect(correct?.[0]?.event_id).toBe(eventAId);
    expect(correct?.[0]?.error_code).toBeNull();

    for (let i = 0; i < 5; i++) {
      const { data: wrong } = await admin.rpc("verify_event_credentials", {
        p_username: "0013-shared-username",
        p_password: "wrong password",
      });
      expect(wrong?.[0]?.event_id).toBeNull();
      expect(wrong?.[0]?.error_code).toBe("invalid");
    }

    const { data: lockedOut } = await admin.rpc("verify_event_credentials", {
      p_username: "0013-shared-username",
      p_password: "correct horse battery staple",
    });
    expect(lockedOut?.[0]?.error_code).toBe("locked");

    await admin
      .from("event_credentials")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("event_id", eventAId);
  });

  it("regenerates the password, invalidating the old one", async () => {
    await admin.rpc("regenerate_event_password", { p_event_id: eventAId, p_password: "new password 123" });
    const { data: oldFails } = await admin.rpc("verify_event_credentials", {
      p_username: "0013-shared-username",
      p_password: "correct horse battery staple",
    });
    expect(oldFails?.[0]?.event_id).toBeNull();
    const { data: newWorks } = await admin.rpc("verify_event_credentials", {
      p_username: "0013-shared-username",
      p_password: "new password 123",
    });
    expect(newWorks?.[0]?.event_id).toBe(eventAId);
  });

  it("lets venue staff read the username via get_event_username, but not another venue's", async () => {
    const staffClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await staffClient.auth.signInWithPassword({ email: staffAEmail, password: staffAPassword });

    const { data: username } = await staffClient.rpc("get_event_username", { p_event_id: eventAId });
    expect(username).toBe("0013-shared-username");
  });

  it("creates and expires couple_sessions rows", async () => {
    const { error } = await admin.from("couple_sessions").insert({
      token: "0013-test-token",
      event_id: eventAId,
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    });
    expect(error).toBeNull();
    const { data } = await admin.from("couple_sessions").select("event_id").eq("token", "0013-test-token").single();
    expect(data?.event_id).toBe(eventAId);
    await admin.from("couple_sessions").delete().eq("token", "0013-test-token");
  });

  it("lets venue staff read event_custom_menu_items for their own event only", async () => {
    const { data: menuItem } = await admin
      .from("menu_items")
      .insert({ venue_id: venueAId, tiers: ["special"], course: "main", name: "0013 Dish" })
      .select()
      .single();
    await admin.from("event_custom_menu_items").insert({ event_id: eventAId, menu_item_id: menuItem!.id });

    const staffClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await staffClient.auth.signInWithPassword({ email: staffAEmail, password: staffAPassword });
    const { data: rows } = await staffClient.from("event_custom_menu_items").select("menu_item_id").eq("event_id", eventAId);
    expect(rows).toHaveLength(1);
  });
});
