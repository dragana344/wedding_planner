import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCoupleSession } from "@/lib/couple/session-token";
import { checkCoupleSession, validateAndRenewCoupleSession } from "@/lib/couple/session-verify";
import { POST as login } from "@/app/api/couple/login/route";
import { addMonths } from "@/lib/couple/access";
import { todayIn } from "@/lib/date";

// Group A task 2: the couple's session and login follow the access life
// cycle — active until the event day, read-only "memories" after it,
// closed after the access end (or once the data is erased).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const today = todayIn();
const CLOSED = "Пристапот до овој настан заврши. За прашања контактирајте го локалот.";
let venueId: string;

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function newEvent(tag: string, fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from("events").insert({ venue_id: venueId, couple_names: `Phase ${tag}`, ...fields }).select("id").single();
  if (error) throw error;
  const { error: credError } = await admin.rpc("create_event_credentials", { p_event_id: data.id, p_username: `phase-${tag}-${stamp}`, p_password: "long-enough-77" });
  if (credError) throw credError;
  return data.id as string;
}

function loginAs(tag: string) {
  return login(
    new NextRequest("http://localhost/api/couple/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `phase-${tag}-${stamp}` },
      body: JSON.stringify({ username: `phase-${tag}-${stamp}`, password: "long-enough-77" }),
    }),
  );
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Access Phase ${stamp}` }).select("id").single()).data!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

describe("couple access phase (group A task 2)", () => {
  it("is active up to and including the event day", async () => {
    const id = await newEvent("today", { event_date: today });
    const { token } = await createCoupleSession(id);
    expect(await validateAndRenewCoupleSession(token)).toMatchObject({ eventId: id, phase: "active" });
  });

  it("is read-only (memories) after the event, and the couple can still sign in", async () => {
    const id = await newEvent("past", { event_date: plusDays(today, -1) });
    const { token } = await createCoupleSession(id);
    expect(await validateAndRenewCoupleSession(token)).toMatchObject({ eventId: id, phase: "memories" });
    expect((await loginAs("past")).status).toBe(200);
  });

  it("closes after the access end: sessions are refused as closed and login answers the message", async () => {
    const id = await newEvent("old", { event_date: plusDays(addMonths(today, -6), -1) });
    const { token } = await createCoupleSession(id);
    expect(await checkCoupleSession(token)).toEqual({ closed: true });
    expect(await validateAndRenewCoupleSession(token)).toBeNull();
    const res = await loginAs("old");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(CLOSED);
    expect(res.cookies.get("couple_session")).toBeUndefined();
  });

  it("an admin extension keeps an old event open; a cancellation end in the past closes a future one", async () => {
    const extended = await newEvent("ext", { event_date: "2020-01-01", couple_access_extended_until: plusDays(today, 10) });
    expect((await checkCoupleSession((await createCoupleSession(extended)).token))).toMatchObject({ session: { phase: "memories" } });

    const cancelled = await newEvent("cnl", { event_date: "2099-01-01", couple_access_until: plusDays(today, -1) });
    expect(await checkCoupleSession((await createCoupleSession(cancelled)).token)).toEqual({ closed: true });
    expect((await loginAs("cnl")).status).toBe(403);
  });

  it("an erased event is closed", async () => {
    const id = await newEvent("erased", { event_date: "2099-01-01", personal_data_erased_at: new Date().toISOString() });
    expect(await checkCoupleSession((await createCoupleSession(id)).token)).toEqual({ closed: true });
    expect((await (await loginAs("erased")).json()).error).toBe(CLOSED);
  });
});
