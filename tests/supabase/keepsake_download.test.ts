// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { loadKeepsake } from "@/lib/couple/keepsake/load";
import { planKeepsakeMedia } from "@/lib/couple/keepsake/media";
import { GET as bookRoute } from "@/app/api/couple/download/book/route";
import { GET as tablesRoute } from "@/app/api/couple/download/tables/route";
import { GET as mediaRoute } from "@/app/api/couple/download/media/route";
import { confirmPhotoUpload, createPhotoUpload } from "@/lib/media/photos";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import { gradientPng } from "../lib/pure/keepsake-fixture";

// Group A task 7: "Преземи ја вашата свадба" gathers a real event — guests,
// greetings (one hidden, two videos from guests with the same name), seating,
// the invitation photo and the album — into the book, the spreadsheets and the
// media ZIP with its folders.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const guestClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const RUN = `keepsake-${Date.now()}`;
let venueId: string;
let eventId: string;
const png = gradientPng();
const video = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]);

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

function request(route: string, phase: "active" | "memories" = "memories") {
  return new NextRequest(`http://localhost${route}`, { headers: { "x-couple-event-id": eventId, "x-couple-access-phase": phase } });
}

async function zipNames(res: Response): Promise<{ file: string; names: string[] }> {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keepsake-zip-")), "out.zip");
  fs.writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
  // macOS's unzip ignores the UTF-8 name flag, so names are read with Python's zipfile.
  const names = JSON.parse(
    execFileSync("python3", ["-c", "import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))", file]).toString(),
  ) as string[];
  return { file, names };
}

function zipEntry(file: string, name: string): Buffer {
  return execFileSync("python3", ["-c", "import sys,zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))", file, name]);
}

beforeAll(async () => {
  const venue = await must(admin.from("venues").insert({ name: `${RUN} Ресторан Езеро` }).select("id").single());
  venueId = venue.id;
  const room = await must(admin.from("rooms").insert({ venue_id: venueId, name: "Голема сала" }).select("id").single());
  const tt = await must(
    admin.from("table_types").insert({ room_id: room.id, name: "Round 8", shape: "round", seats: 8, width_cm: 180, length_cm: 180, quantity: 5 }).select("id").single(),
  );
  const event = await must(
    admin.from("events").insert({ venue_id: venueId, couple_names: "Ана & Марко", event_date: "2027-06-12", start_time: "18:00", event_type: "wedding", total_price: 300000, deposit_paid: 50000 }).select("id").single(),
  );
  eventId = event.id;
  await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: room.id }));
  const table = await must(
    admin.from("event_layout_elements")
      .insert({ event_id: eventId, room_id: room.id, element_type: "table", table_type_id: tt.id, x_cm: 0, y_cm: 0, width_cm: 180, length_cm: 180 })
      .select("id").single(),
  );
  const [ana, boris] = await must(
    admin.from("event_guests")
      .insert([
        { event_id: eventId, full_name: "Ана Петрова", rsvp_status: "confirmed", party_size: 2, side: "bride" },
        { event_id: eventId, full_name: "Борис Стојанов", rsvp_status: "declined", party_size: 1, side: "groom" },
      ])
      .select("id"),
  );
  await must(
    admin.rpc("replace_table_seats", {
      p_event_id: eventId, p_room_id: room.id, p_element_id: table.id,
      p_seats: [{ seat_number: 1, guest_id: ana.id }, { seat_number: 2, guest_id: ana.id }, { seat_number: 3, guest_name: "Чичко Јован" }],
    }),
  );

  // Two video greetings from guests with the same name, one hidden text greeting.
  for (const n of [1, 2]) {
    const videoPath = `${eventId}/videos/${RUN}-${n}.mp4`;
    await must(admin.storage.from("event-media").upload(videoPath, new Blob([video], { type: "video/mp4" }), { contentType: "video/mp4" }));
    await must(admin.from("event_greetings").insert({ event_id: eventId, guest_id: n === 1 ? ana.id : null, first_name: "Ана", last_name: "Петрова", message: `Честито ${n}!`, video_path: videoPath, video_bytes: video.length }));
  }
  await must(admin.from("event_greetings").insert({ event_id: eventId, guest_id: boris.id, first_name: "Борис", last_name: "Стојанов", message: "Скриена порака", hidden_at: new Date().toISOString() }));

  const photoPath = `${eventId}-${Date.now()}.png`;
  await must(admin.storage.from("invitation-photos").upload(photoPath, new Blob([new Uint8Array(png)], { type: "image/png" }), { contentType: "image/png" }));
  await must(admin.from("event_invitations").insert({ event_id: eventId, template_id: "elegant-gold", public_slug: RUN, message: "Ве покануваме!", photo_path: photoPath }));

  const jpeg = new Uint8Array(80);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
  const upload = await createPhotoUpload(eventId, jpeg.length);
  await guestClient.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, new Blob([jpeg], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  await confirmPhotoUpload(eventId, { path: upload.path, uploaderName: "Тетка Роса" });

  await must(admin.from("event_agenda_items").insert({ event_id: eventId, time: "18:00", title: "Пречек на гостите", sort_order: 1 }));
  await must(admin.from("event_budget_items").insert({ event_id: eventId, category: "photography", name: "Фотограф", estimated_amount: 40000, paid_amount: 20000 }));
  await must(admin.from("event_checklist_items").insert({ event_id: eventId, title: "Нарачај торта", is_done: true }));
  await must(admin.from("event_notes").insert({ event_id: eventId, title: null, content: "Прв танц\nPerfect" }));
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("keepsake download", () => {
  it("gathers the whole event, without hidden greetings", async () => {
    const data = await loadKeepsake(eventId);
    expect(data).toMatchObject({ isWedding: true, coupleNames: "Ана & Марко", eventDate: "2027-06-12", roomNames: ["Голема сала"] });
    expect(data.venueName).toContain("Ресторан Езеро");
    expect(data.invitation).toMatchObject({ templateId: "elegant-gold", message: "Ве покануваме!", photo: { format: "png" } });
    expect(Buffer.compare(data.invitation!.photo!.data, png)).toBe(0);
    expect(data.guests.map((g) => [g.fullName, g.status, g.partySize])).toEqual([
      ["Ана Петрова", "confirmed", 2],
      ["Борис Стојанов", "declined", 1],
    ]);
    expect(data.attending).toEqual({ people: 2, children: 0, parties: 1 });
    expect(data.tables).toEqual([
      { room: "Голема сала", title: "Маса 1", capacity: 8, seats: [{ number: 1, name: "Ана Петрова" }, { number: 2, name: "Ана Петрова" }, { number: 3, name: "Чичко Јован" }] },
    ]);
    expect(data.greetings.map((g) => [g.message, g.hasVideo])).toEqual([["Честито 1!", true], ["Честито 2!", true]]);
    // toContainEqual: the shared local DB may also seed a restaurant agenda row (another checkout's 0155–0158).
    expect(data.agenda).toContainEqual({ time: "18:00", title: "Пречек на гостите", location: null, notes: null });
    expect(data.budget).toMatchObject({ venue: { estimated: 300000, paid: 50000 }, totalEstimated: 340000, totalPaid: 70000 });
    expect(data.budget.items[0]).toMatchObject({ category: "Фотографија", name: "Фотограф" });
    expect(data.checklist).toEqual([{ title: "Нарачај торта", dueDate: null, done: true, subtasks: [] }]);
    expect(data.notes).toEqual([{ title: "Прв танц", content: "Perfect", updatedAt: expect.any(String) }]);
  });

  it("serves the book during the read-only period", async () => {
    const res = await bookRoute(request("/api/couple/download/book"), { params: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("zips the spreadsheets with a BOM", async () => {
    const res = await tablesRoute(request("/api/couple/download/tables"), { params: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent("Табели — Ана & Марко.zip")}`);
    const { file, names } = await zipNames(res);
    expect(names).toEqual(["Гости.csv", "Буџет.csv", "Распоред на маси.csv"]);
    const guests = zipEntry(file, "Гости.csv").toString("utf8");
    expect(guests.startsWith("﻿")).toBe(true);
    expect(guests).toContain("Ана Петрова");
    expect(zipEntry(file, "Буџет.csv").toString("utf8")).toContain("Фотографија;Фотограф;40000;20000");
    expect(zipEntry(file, "Распоред на маси.csv").toString("utf8")).toContain("Голема сала;Маса 1;3;Чичко Јован");
  });

  it("puts the invitation photo, the named video greetings and the album in folders", async () => {
    const res = await mediaRoute(request("/api/couple/download/media?part=1"), { params: {} });
    expect(res.status).toBe(200);
    const { file, names } = await zipNames(res);
    expect(names).toHaveLength(4);
    expect(names[0]).toBe("Покана/Покана.png");
    expect(names.slice(1, 3)).toEqual(["Видео честитки/Ана Петрова.mp4", "Видео честитки/Ана Петрова (2).mp4"]);
    expect(names[3]).toMatch(/^Фотографии и видеа\/001-Тетка-Роса-\d{4}\.jpg$/);
    expect(Buffer.compare(zipEntry(file, "Покана/Покана.png"), png)).toBe(0);
    expect(new Uint8Array(zipEntry(file, names[1]))).toEqual(video);
    expect((await mediaRoute(request("/api/couple/download/media?part=2"), { params: {} })).status).toBe(400);
  });

  it("pinned (`before`), greetings and album files added after the pin are left out of the parts", async () => {
    const all = (await planKeepsakeMedia(eventId, "2999-01-01T00:00:00.000Z")).flat().map((f) => f.name);
    expect(all).toEqual((await planKeepsakeMedia(eventId)).flat().map((f) => f.name));
    // Everything here was added after 2000: only the invitation photo (not a guest upload) is left.
    expect((await planKeepsakeMedia(eventId, "2000-01-01T00:00:00.000Z")).flat().map((f) => f.name)).toEqual(["Покана/Покана.png"]);
    const res = await mediaRoute(request("/api/couple/download/media?part=1&before=2000-01-01T00%3A00%3A00.000Z"), { params: {} });
    expect((await zipNames(res)).names).toEqual(["Покана/Покана.png"]);
  });
});
