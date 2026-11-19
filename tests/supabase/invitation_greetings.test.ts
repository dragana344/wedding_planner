// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as rsvp } from "@/app/api/invite/[slug]/rsvp/route";
import { POST as greet } from "@/app/api/invite/[slug]/greetings/route";
import { POST as startVideo } from "@/app/api/invite/[slug]/greetings/video/route";
import { POST as identify } from "@/app/api/invite/[slug]/greetings/identify/route";
import { issueGreetingTicket, readGreetingTicket, getInvitationGreetingState } from "@/lib/couple/invite-greetings";
import { listGreetingsForGuest } from "@/lib/couple/guest-greetings";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// 0151: greetings come back with the invitation. After an RSVP — any answer —
// the guest sends a message (and a video); each greeting belongs to the guest
// the answer was saved to, one per guest. On the default plan greetings,
// video greetings and personal links are on, and videos may be 30 s.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const guestClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const slug = `greet${stamp}`.slice(0, 20);
const otherSlug = `greeto${stamp}`.slice(0, 20);
let venueId: string;
let eventId: string;
let otherEventId: string;
let anaId: string;
let anaToken: string;

const MP4 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);

function call(handler: typeof rsvp, invitationSlug: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/invite/${invitationSlug}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `greet-${Math.random()}` },
    body: JSON.stringify(body),
  });
  return handler(req, { params: { slug: invitationSlug } });
}

async function answer(fullName: string, status: "confirmed" | "declined" | "later", invitationSlug = slug) {
  const res = await call(rsvp, invitationSlug, { full_name: fullName, status, party_size: 1 });
  expect(res.status).toBe(200);
  return (await res.json()).greeting as { ticket: string; sent: boolean };
}

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: `Greeting Venue ${stamp}` }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Ана и Марко", event_date: "2029-06-01" }).select("id").single()).data!.id;
  otherEventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Други", event_date: "2029-07-01" }).select("id").single()).data!.id;
  await admin.from("event_invitations").insert([
    { event_id: eventId, template_id: "romantic-floral", public_slug: slug },
    { event_id: otherEventId, template_id: "romantic-floral", public_slug: otherSlug },
  ]);
  const ana = (await admin.from("event_guests").insert({ event_id: eventId, full_name: "Ана Петрова" }).select("id, invite_token").single()).data!;
  anaId = ana.id;
  anaToken = ana.invite_token;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("greetings from the invitation", () => {
  it("shared link: a guest who says they are not coming can still send one, tied to their guest entry", async () => {
    const ticket = await answer("Ана Петрова", "declined");
    expect(ticket.sent).toBe(false);

    const res = await call(greet, slug, { ticket: ticket.ticket, message: "Жал ни е, честито!" });
    expect(res.status).toBe(200);
    const { data: row } = await admin.from("event_greetings").select("event_id, guest_id, first_name, last_name, message").eq("id", (await res.json()).id).single();
    expect(row).toEqual({ event_id: eventId, guest_id: anaId, first_name: "Ана", last_name: "Петрова", message: "Жал ни е, честито!" });

    // The couple sees it on Ана's card.
    expect((await listGreetingsForGuest(eventId, anaId)).map((g) => g.message)).toEqual(["Жал ни е, честито!"]);
  });

  it("one per guest: a second greeting is refused, and the next RSVP says it was already sent", async () => {
    const ticket = await answer("Ана Петрова", "confirmed");
    expect(ticket.sent).toBe(true);
    const res = await call(greet, slug, { ticket: ticket.ticket, message: "Уште една" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Веќе испративте честитка. Ви благодариме!" });
    // The personal link is the same guest, so it is refused too.
    expect((await call(greet, slug, { guest_token: anaToken, message: "И уште" })).status).toBe(400);
  });

  it("a guest added by their answer (single-word name) gets their own greeting", async () => {
    const ticket = await answer(`Мила${stamp}`, "later");
    const res = await call(greet, slug, { ticket: ticket.ticket, message: "Се гледаме!" });
    expect(res.status).toBe(200);
    const { data: row } = await admin.from("event_greetings").select("guest_id, first_name, last_name").eq("id", (await res.json()).id).single();
    const { data: mila } = await admin.from("event_guests").select("id").eq("event_id", eventId).eq("full_name", `Мила${stamp}`).single();
    expect(row).toEqual({ guest_id: mila!.id, first_name: `Мила${stamp}`, last_name: "" });
  });

  it("refuses a greeting without a valid ticket or token: forged, from another invitation, or none", async () => {
    const forged = issueGreetingTicket(eventId, anaId).replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    const otherTicket = await answer("Неко", "confirmed", otherSlug);
    for (const body of [{ ticket: forged }, { ticket: otherTicket.ticket }, { guest_token: "x".repeat(24) }]) {
      const res = await call(greet, slug, { ...body, message: "Здраво" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Прво одговорете на поканата, па испратете честитка." });
    }
    expect((await call(greet, slug, { message: "Без ништо" })).status).toBe(400);
  });

  it("a ticket expires after a day", () => {
    const issued = issueGreetingTicket(eventId, anaId, Date.parse("2029-01-01T10:00:00Z"));
    expect(readGreetingTicket(eventId, issued, Date.parse("2029-01-02T09:59:00Z"))).toBe(anaId);
    expect(readGreetingTicket(eventId, issued, Date.parse("2029-01-02T10:01:00Z"))).toBeNull();
    expect(readGreetingTicket(otherEventId, issued, Date.parse("2029-01-01T11:00:00Z"))).toBeNull();
  });

  it("personal link: a greeting with a video within the package's 30 s", async () => {
    const marko = (await admin.from("event_guests").insert({ event_id: eventId, full_name: "Марко Марков" }).select("id, invite_token").single()).data!;
    const tooLong = await call(startVideo, slug, { guest_token: marko.invite_token, bytes: MP4.length, seconds: 31 });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: "Видеото е подолго од 30 секунди." });

    const start = await call(startVideo, slug, { guest_token: marko.invite_token, bytes: MP4.length, seconds: 20 });
    expect(start.status).toBe(200);
    const { path, token, bucket } = await start.json();
    const { error } = await guestClient.storage.from(bucket).uploadToSignedUrl(path, token, new Blob([MP4], { type: "video/mp4" }), { contentType: "video/mp4" });
    expect(error).toBeNull();

    const res = await call(greet, slug, { guest_token: marko.invite_token, message: "Среќно!", video_path: path });
    expect(res.status).toBe(200);
    const { data: row } = await admin.from("event_greetings").select("guest_id, video_path, video_bytes").eq("id", (await res.json()).id).single();
    expect(row!.guest_id).toBe(marko.id);
    expect(row!.video_path).toMatch(new RegExp(`^${eventId}/videos/.+\\.mp4$`));
    expect(row!.video_bytes).toBe(MP4.length);
    expect(await getInvitationGreetingState(slug, marko.invite_token)).toEqual({ enabled: true, videoSeconds: 30, sent: true });
  });

  it("the package decides: greetings off → 403; video greetings off → no video, text still fine", async () => {
    const { data: guest } = await admin.from("event_guests").insert({ event_id: eventId, full_name: "Пакет Тест" }).select("invite_token").single();
    await admin.from("event_feature_overrides").insert({ event_id: eventId, feature_key: "video_greetings", enabled: false });
    expect((await call(startVideo, slug, { guest_token: guest!.invite_token, bytes: 10, seconds: 5 })).status).toBe(403);
    expect(await getInvitationGreetingState(slug)).toEqual({ enabled: true, videoSeconds: 0, sent: false });

    await admin.from("event_feature_overrides").insert({ event_id: eventId, feature_key: "guest_greetings", enabled: false });
    const res = await call(greet, slug, { guest_token: guest!.invite_token, message: "Здраво" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Оваа функција не е вклучена во вашиот пакет." });
    expect((await getInvitationGreetingState(slug))!.enabled).toBe(false);
    await admin.from("event_feature_overrides").delete().eq("event_id", eventId);
  });

  describe("sending one before answering (0152)", () => {
    it("0179: shared link, a name nobody has creates nothing and asks to answer first; after answering, the greeting is tied to that guest", async () => {
      const name = `Пред одговор ${stamp}`;
      const res = await call(identify, slug, { full_name: name });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Не ве најдовме со сигурност на листата. Прво одговорете на поканата погоре — потоа можете да испратите честитка.");
      const { count: none } = await admin.from("event_guests").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("full_name", name);
      expect(none).toBe(0);

      // Answering creates the guest; identify then finds them (exact name), and the remember token works too.
      const answered = await call(rsvp, slug, { full_name: name, status: "confirmed", party_size: 1 });
      const { remember } = await answered.json();
      const { data: created } = await admin.from("event_guests").select("id").eq("event_id", eventId).eq("full_name", name).single();
      const byName = await (await call(identify, slug, { full_name: name })).json();
      const greetRes = await call(greet, slug, { ticket: byName.ticket, message: "Однапред честитки!" });
      expect(greetRes.status).toBe(200);
      const { data: row } = await admin.from("event_greetings").select("guest_id").eq("id", (await greetRes.json()).id).single();
      expect(row!.guest_id).toBe(created!.id);
      const byToken = await (await call(identify, slug, { full_name: "Друго Име", remember })).json();
      expect(readGreetingTicket(eventId, byToken.ticket)).toBe(created!.id);
      expect(byToken.sent).toBe(true);
    });

    it("0179: shared link, an unsure name (namesakes or only across scripts) does not unlock a greeting", async () => {
      const name = `Двојник ${stamp}`;
      await admin.from("event_guests").insert([{ event_id: eventId, full_name: name }, { event_id: eventId, full_name: name }]);
      expect((await call(identify, slug, { full_name: name })).status).toBe(400);
      expect((await call(identify, slug, { full_name: "Ana Petrova" })).status).toBe(400);
    });

    it("0184: unknown, unsure and a phone with a name that doesn't fit all get the very same answer; a phone with a fitting name unlocks", async () => {
      const listed = `Со телефон ${stamp}`;
      await admin.from("event_guests").insert({ event_id: eventId, full_name: listed, phone: "070 987 654" });
      const twin = `Близнак ${stamp}`;
      await admin.from("event_guests").insert([{ event_id: eventId, full_name: twin }, { event_id: eventId, full_name: twin }]);
      const reply = async (body: Record<string, unknown>) => {
        const res = await call(identify, slug, body);
        return { status: res.status, body: await res.json() };
      };
      const unknown = await reply({ full_name: `Никој Таков ${stamp}` });
      expect(unknown.status).toBe(400);
      for (const body of [{ full_name: twin }, { full_name: "Ana Petrova" }, { full_name: `Никој Таков ${stamp}`, phone: "070 987 654" }]) {
        expect(await reply(body), JSON.stringify(body)).toEqual(unknown);
      }
      const fits = await reply({ full_name: listed.split(" ")[0], phone: "+389 70 987 654" });
      expect(fits.status).toBe(200);
      expect(fits.body.ticket).toEqual(expect.any(String));
    });

    it("shared link: typing a name the couple already listed reuses that guest instead of creating a duplicate", async () => {
      const name = `Веќе на листата ${stamp}`;
      const existing = (await admin.from("event_guests").insert({ event_id: eventId, full_name: name }).select("id").single()).data!;
      const res = await call(identify, slug, { full_name: name });
      const { ticket } = await res.json();
      const greetRes = await call(greet, slug, { ticket, message: "Однапред" });
      const { data: row } = await admin.from("event_greetings").select("guest_id").eq("id", (await greetRes.json()).id).single();
      expect(row!.guest_id).toBe(existing.id);
    });

    it("personal link never needs identify: its token works the same before or after answering", async () => {
      const guest = (await admin.from("event_guests").insert({ event_id: eventId, full_name: "Пред одговор Лична" }).select("id, invite_token").single()).data!;
      expect(await getInvitationGreetingState(slug, guest.invite_token)).toEqual({ enabled: true, videoSeconds: 30, sent: false });
      const res = await call(greet, slug, { guest_token: guest.invite_token, message: "Пред да одговорам" });
      expect(res.status).toBe(200);
    });

    it("refuses a blank name, and an unknown invitation", async () => {
      expect((await call(identify, slug, { full_name: "   " })).status).toBe(400);
      expect((await call(identify, "no-such-invite", { full_name: "Неко" })).status).toBe(404);
    });
  });
});
