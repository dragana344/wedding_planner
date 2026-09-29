// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { GET as zipRoute } from "@/app/api/couple/album/zip/route";
import { confirmPhotoUpload, createPhotoUpload, setPhotoHidden } from "@/lib/media/photos";
import { MEDIA_BUCKET } from "@/lib/media/storage";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";

// C3: "download all" streams the visible photos as a ZIP, in parts.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const guest = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
let venueId: string;
let eventId: string;
const contents: Uint8Array[] = [];

function jpeg(seed: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(64 + seed);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  bytes.fill(seed, 4);
  return bytes;
}

function zipRequest(part: string) {
  return new NextRequest(`http://localhost/api/couple/album/zip?part=${part}`, { headers: { "x-couple-event-id": eventId } });
}

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Zip Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin.from("events").insert({ venue_id: venueId, couple_names: "Zip", event_date: "2027-12-04" }).select("id").single();
  eventId = event!.id;
  const ids: string[] = [];
  for (const [i, name] of ["Тетка Роса", null, "Вујко"].entries()) {
    const bytes = jpeg(i + 1);
    contents.push(bytes);
    const upload = await createPhotoUpload(eventId, bytes.length);
    await guest.storage.from(MEDIA_BUCKET).uploadToSignedUrl(upload.path, upload.token, new Blob([bytes], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    ids.push((await confirmPhotoUpload(eventId, { path: upload.path, uploaderName: name })).id);
  }
  await setPhotoHidden(eventId, ids[2], true);
}, 60_000);

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await drainStorageCleanupQueue();
});

describe("album zip", () => {
  it("streams the visible photos, oldest first, as a valid archive", async () => {
    const res = await zipRoute(zipRequest("1"), { params: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="album-2027-12-04-del-1.zip"');

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "album-zip-")), "album.zip");
    fs.writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
    expect(execFileSync("unzip", ["-t", file]).toString()).toContain("No errors detected");
    const names = JSON.parse(
      execFileSync("python3", ["-c", "import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))", file]).toString(),
    ) as string[];
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^001-Тетка-Роса-\d{4}\.jpg$/);
    expect(names[1]).toMatch(/^002-gostin-\d{4}\.jpg$/);
    expect(new Uint8Array(execFileSync("unzip", ["-p", file, "001-*"]))).toEqual(contents[0]);
  });

  it("refuses a part that does not exist", async () => {
    expect((await zipRoute(zipRequest("5"), { params: {} })).status).toBe(400);
    expect((await zipRoute(zipRequest("abc"), { params: {} })).status).toBe(400);
  });
});
