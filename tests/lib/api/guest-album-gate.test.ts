// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Public guest routes /api/e/<token>/… refuse with 403 and the locked message
// when the album's event lacks photo_album / guest_greetings / video_greetings.

const m = vi.hoisted(() => ({
  eventHasFeature: vi.fn(),
  getAlbumByToken: vi.fn(),
  createPhotoUpload: vi.fn(async () => ({ path: "p", token: "t", bucket: "b" })),
  confirmPhotoUpload: vi.fn(async () => ({ id: "ph1" })),
  createGreeting: vi.fn(async () => ({ id: "g1" })),
  createVideoUpload: vi.fn(async () => ({ path: "v", token: "t", bucket: "b" })),
}));
vi.mock("@/lib/entitlements/server", () => ({ eventHasFeature: m.eventHasFeature }));
vi.mock("@/lib/media/album", () => ({ getAlbumByToken: m.getAlbumByToken }));
vi.mock("@/lib/media/photos", () => ({ createPhotoUpload: m.createPhotoUpload, confirmPhotoUpload: m.confirmPhotoUpload }));
vi.mock("@/lib/media/greetings", () => ({ createGreeting: m.createGreeting, createVideoUpload: m.createVideoUpload }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "1.2.3.4",
  rateLimitedResponse: vi.fn(),
}));

import { POST as photos } from "@/app/api/e/[token]/photos/route";
import { POST as confirm } from "@/app/api/e/[token]/photos/confirm/route";
import { POST as greetings } from "@/app/api/e/[token]/greetings/route";
import { POST as video } from "@/app/api/e/[token]/greetings/video/route";

const TOKEN = "a".repeat(24);
const LOCKED = "Оваа функција не е вклучена во вашиот пакет.";
const greeting = { first_name: "Ана", last_name: "Петрова", message: "Честито!" };

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
  { name: "greeting", route: greetings, path: "/greetings", body: greeting, feature: "guest_greetings", impl: m.createGreeting },
  { name: "video upload", route: video, path: "/greetings/video", body: { bytes: 100 }, feature: "video_greetings", impl: m.createVideoUpload },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  m.getAlbumByToken.mockResolvedValue({ eventId: "e1", coupleNames: "A & B", eventDate: "2027-01-01", venueName: "V" });
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

  it("a video upload also needs guest_greetings", async () => {
    m.eventHasFeature.mockImplementation(async (_e: string, key: string) => key === "video_greetings");
    const res = await video(post("/greetings/video", { bytes: 100 }), ctx);
    expect(res.status).toBe(403);
    expect(m.createVideoUpload).not.toHaveBeenCalled();
  });

  it("a greeting with a video also needs video_greetings", async () => {
    m.eventHasFeature.mockImplementation(async (_e: string, key: string) => key === "guest_greetings");
    const res = await greetings(post("/greetings", { ...greeting, video_path: "pending/e1/x" }), ctx);
    expect(res.status).toBe(403);
    expect(m.createGreeting).not.toHaveBeenCalled();
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
