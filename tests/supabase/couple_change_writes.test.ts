// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PATCH as patchGuestCount } from "@/app/api/couple/guest-count/route";
import { PATCH as patchContact } from "@/app/api/couple/contact-info/route";
import { POST as login } from "@/app/api/couple/login/route";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const username = `change-writes-${stamp}`;
const password = "Change-writes-pass-1";
let venueId: string;
let eventId: string;

function patch(url: string, body: unknown, side?: "bride" | "groom") {
  return new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-couple-event-id": eventId, ...(side ? { "x-couple-organizer-side": side } : {}) },
    body: JSON.stringify(body),
  });
}

async function lastChange(section: string) {
  const { data, error } = await admin.from("event_changes").select("side, changed_by, new_value").eq("event_id", eventId).eq("section", section).order("changed_at", { ascending: false }).limit(1);
  if (error) throw error;
  return data![0];
}

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: `Change Writes ${stamp}` }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin.from("events").insert({ venue_id: venueId, couple_names: "Writes & Test", event_date: "2030-06-01", guest_count_estimate: 50 }).select("id").single();
  eventId = event!.id;
  const { error } = await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: username, p_password: password });
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("couple write paths record changes", () => {
  it("guest count by the main login is Младенците", async () => {
    const res = await patchGuestCount(patch("/api/couple/guest-count", { guest_count_estimate: 80 }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ guest_count_estimate: 80 });
    const c = await lastChange("guest_count");
    expect(c.side).toBe("couple");
    expect(c.changed_by).toBe("Младенците");
  });

  it("guest count by a co-organizer is Ко-организатор", async () => {
    const res = await patchGuestCount(patch("/api/couple/guest-count", { guest_count_estimate: 90 }, "bride"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const c = await lastChange("guest_count");
    expect(c.side).toBe("couple");
    expect(c.changed_by).toBe("Ко-организатор");
  });

  it("contact info is recorded per side", async () => {
    const res = await patchContact(patch("/api/couple/contact-info", { contact_email: "a@test.local", contact_phone: "070111222" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    let c = await lastChange("contact");
    expect(c.side).toBe("couple");
    expect(c.changed_by).toBe("Младенците");

    await patchContact(patch("/api/couple/contact-info", { contact_email: "b@test.local" }, "groom"), { params: Promise.resolve({}) });
    c = await lastChange("contact");
    expect(c.changed_by).toBe("Ко-организатор");
  });
});

describe("first login", () => {
  it("a successful login sets couple_first_login_at once", async () => {
    const before = await admin.from("events").select("couple_first_login_at").eq("id", eventId).single();
    expect(before.data!.couple_first_login_at).toBeNull();
    const doLogin = () =>
      login(new NextRequest("http://localhost/api/couple/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `cw-${stamp}` }, body: JSON.stringify({ username, password }) }));
    expect((await doLogin()).status).toBe(200);
    const first = (await admin.from("events").select("couple_first_login_at").eq("id", eventId).single()).data!.couple_first_login_at;
    expect(first).not.toBeNull();
    expect((await doLogin()).status).toBe(200);
    const second = (await admin.from("events").select("couple_first_login_at").eq("id", eventId).single()).data!.couple_first_login_at;
    expect(second).toBe(first);
  });
});
