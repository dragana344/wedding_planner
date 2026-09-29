// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GET as listRoute } from "@/app/api/couple/album/photos/route";
import { PATCH as patchPhoto, DELETE as deletePhotoRoute } from "@/app/api/couple/album/photos/[id]/route";
import { PATCH as patchGreeting, DELETE as deleteGreetingRoute } from "@/app/api/couple/greetings/[id]/route";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// C3/C10: only the signed-in couple's own event is reachable.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let venueId: string;
let eventId: string;
let otherEventId: string;
let photoId: string;

function req(method: string, path: string, event: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "x-couple-event-id": event, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Couple Album Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: events } = await admin
    .from("events")
    .insert([
      { venue_id: venueId, couple_names: "Album One", event_date: "2027-11-01" },
      { venue_id: venueId, couple_names: "Album Two", event_date: "2027-11-02" },
    ])
    .select("id");
  [eventId, otherEventId] = events!.map((e) => e.id);
  const { data: p } = await admin
    .from("event_photos")
    .insert({ event_id: eventId, storage_path: `${eventId}/photos/a.jpg`, bytes: 10, mime: "image/jpeg", consent_at: new Date().toISOString() })
    .select("id")
    .single();
  photoId = p!.id;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("couple album routes", () => {
  it("need a couple session", async () => {
    const res = await listRoute(new NextRequest("http://localhost/api/couple/album/photos"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("list the couple's photos, hidden ones included", async () => {
    await admin.from("event_photos").update({ hidden_at: new Date().toISOString() }).eq("id", photoId);
    const res = await listRoute(req("GET", "/api/couple/album/photos", eventId), { params: {} });
    const body = await res.json();
    expect(body.photos.map((p: { id: string }) => p.id)).toEqual([photoId]);
    expect(body.photos[0].hidden).toBe(true);
    const other = await (await listRoute(req("GET", "/api/couple/album/photos", otherEventId), { params: {} })).json();
    expect(other.photos).toEqual([]);
    await admin.from("event_photos").update({ hidden_at: null }).eq("id", photoId);
  });

  it("reject an invalid id or body", async () => {
    expect((await patchPhoto(req("PATCH", "/x", eventId, { hidden: true }), { params: { id: "nope" } })).status).toBe(400);
    expect((await patchPhoto(req("PATCH", "/x", eventId, { hidden: "yes" }), { params: { id: photoId } })).status).toBe(400);
  });

  it("cannot touch another event's photo", async () => {
    await patchPhoto(req("PATCH", "/x", otherEventId, { hidden: true }), { params: { id: photoId } });
    await deletePhotoRoute(req("DELETE", "/x", otherEventId), { params: { id: photoId } });
    const { data } = await admin.from("event_photos").select("hidden_at").eq("id", photoId).single();
    expect(data).toEqual({ hidden_at: null });
  });

  it("cannot hide or delete another event's greeting, but can its own", async () => {
    const { data: g } = await admin
      .from("event_greetings")
      .insert({ event_id: eventId, first_name: "Ана", last_name: "Петрова", message: "Честито!" })
      .select("id")
      .single();
    await patchGreeting(req("PATCH", "/x", otherEventId, { hidden: true }), { params: { id: g!.id } });
    await deleteGreetingRoute(req("DELETE", "/x", otherEventId), { params: { id: g!.id } });
    expect((await admin.from("event_greetings").select("hidden_at").eq("id", g!.id).single()).data).toEqual({ hidden_at: null });

    expect((await patchGreeting(req("PATCH", "/x", eventId, { hidden: true }), { params: { id: g!.id } })).status).toBe(200);
    expect((await admin.from("event_greetings").select("hidden_at").eq("id", g!.id).single()).data!.hidden_at).not.toBeNull();
    expect((await deleteGreetingRoute(req("DELETE", "/x", eventId), { params: { id: g!.id } })).status).toBe(200);
    expect((await admin.from("event_greetings").select("id").eq("id", g!.id)).data).toEqual([]);
  });

  it("hide and delete the couple's own photo", async () => {
    expect((await patchPhoto(req("PATCH", "/x", eventId, { hidden: true }), { params: { id: photoId } })).status).toBe(200);
    expect((await admin.from("event_photos").select("hidden_at").eq("id", photoId).single()).data!.hidden_at).not.toBeNull();
    expect((await deletePhotoRoute(req("DELETE", "/x", eventId), { params: { id: photoId } })).status).toBe(200);
    expect((await admin.from("event_photos").select("id").eq("id", photoId)).data).toEqual([]);
  });
});
