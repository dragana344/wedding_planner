// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Public guest routes /api/e/<token>/… refuse with 403 and the locked message
// when the album's event lacks photo_album (and, for videos, max_video_seconds).
// Since 0151 the QR page is for photos and videos only; greetings come with
// the invitation.

const m = vi.hoisted(() => ({
  eventHasFeature: vi.fn(),
  getAlbumByToken: vi.fn(),
  createPhotoUpload: vi.fn(async () => ({ path: "p", token: "t", bucket: "b" })),
  confirmPhotoUpload: vi.fn(async () => ({ id: "ph1" })),
  createVideoUpload: vi.fn(async () => ({ path: "v", token: "t", bucket: "b" })),
  confirmAlbumVideo: vi.fn(async () => ({ id: "vid1" })),
  maxVideo: { enabled: true, limit: 30 as number | null },
}));
vi.mock("@/lib/entitlements/server", () => ({
  eventHasFeature: m.eventHasFeature,
  getEventFeatures: vi.fn(async () => ({ max_video_seconds: m.maxVideo })),
}));
vi.mock("@/lib/media/album", () => ({ getAlbumByToken: m.getAlbumByToken }));
vi.mock("@/lib/media/photos", () => ({ createPhotoUpload: m.createPhotoUpload, confirmPhotoUpload: m.confirmPhotoUpload }));
vi.mock("@/lib/media/videos", () => ({ createVideoUpload: m.createVideoUpload, confirmAlbumVideo: m.confirmAlbumVideo }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "1.2.3.4",
  rateLimitedResponse: vi.fn(),
}));

import { POST as photos } from "@/app/api/e/[token]/photos/route";
import { POST as confirm } from "@/app/api/e/[token]/photos/confirm/route";
import { POST as video } from "@/app/api/e/[token]/videos/route";
import { POST as videoConfirm } from "@/app/api/e/[token]/videos/confirm/route";

const TOKEN = "a".repeat(24);
const LOCKED = "Оваа функција не е вклучена во вашиот пакет.";

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost/api/e/${TOKEN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: { token: TOKEN } };

const cases = [
  { name: "photo upload", route: photos, path: "/photos", body: { bytes: 100 }, feature: "photo_album", impl: m.createPhotoUpload },
  { name: "photo confirm", route: confirm, path: "/photos/confirm", body: { path: "pending/x", consent: true }, feature: "photo_album", impl: m.confirmPhotoUpload },
  { name: "video upload", route: video, path: "/videos", body: { bytes: 100, seconds: 10 }, feature: "photo_album", impl: m.createVideoUpload },
  { name: "video upload", route: video, path: "/videos", body: { bytes: 100, seconds: 10 }, feature: "max_video_seconds", impl: m.createVideoUpload },
  { name: "video confirm", route: videoConfirm, path: "/videos/confirm", body: { path: "pending/x", consent: true }, feature: "photo_album", impl: m.confirmAlbumVideo },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  m.getAlbumByToken.mockResolvedValue({ eventId: "e1", coupleNames: "A & B", eventDate: "2027-01-01", venueName: "V" });
  m.maxVideo = { enabled: true, limit: 30 };
});

describe("guest album routes respect the event's package", () => {
  for (const c of cases) {
    it(`${c.name}: 403 with the locked message when ${c.feature} is off`, async () => {
      m.eventHasFeature.mockImplementation(async (_e: string, key: string) => key !== c.feature);
      const res = await c.route(post(c.path, c.body), ctx);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: LOCKED });
      expect(m.eventHasFeature).toHaveBeenCalledWith("e1", c.feature);
      expect(c.impl).not.toHaveBeenCalled();
    });

    it(`${c.name}: runs when ${c.feature} is on`, async () => {
      m.eventHasFeature.mockResolvedValue(true);
      const res = await c.route(post(c.path, c.body), ctx);
      expect(res.status).toBe(200);
      expect(c.impl).toHaveBeenCalled();
    });
  }

  it("a package with a 0-second video limit takes no videos", async () => {
    m.eventHasFeature.mockResolvedValue(true);
    m.maxVideo = { enabled: true, limit: 0 };
    const res = await video(post("/videos", { bytes: 100, seconds: 5 }), ctx);
    expect(res.status).toBe(403);
    expect(m.createVideoUpload).not.toHaveBeenCalled();
  });

  it("refuses a video longer than the package's limit, and allows any length with no limit", async () => {
    m.eventHasFeature.mockResolvedValue(true);
    const tooLong = await video(post("/videos", { bytes: 100, seconds: 31 }), ctx);
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: "Видеото е подолго од 30 секунди." });
    expect(m.createVideoUpload).not.toHaveBeenCalled();

    m.maxVideo = { enabled: true, limit: null };
    expect((await video(post("/videos", { bytes: 100, seconds: 600 }), ctx)).status).toBe(200);
  });

  it("an unknown token is still 404 (no feature lookup)", async () => {
    m.getAlbumByToken.mockResolvedValue(null);
    const res = await photos(post("/photos", { bytes: 1 }), ctx);
    expect(res.status).toBe(404);
    expect(m.eventHasFeature).not.toHaveBeenCalled();
  });

  it("a failed feature read fails closed with the route's generic error", async () => {
    m.eventHasFeature.mockRejectedValue(new Error("db down"));
    const res = await photos(post("/photos", { bytes: 1 }), ctx);
    expect(res.status).toBe(400);
    expect(m.createPhotoUpload).not.toHaveBeenCalled();
  });
});
