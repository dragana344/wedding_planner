// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { keepsakeFixture } from "../pure/keepsake-fixture";

// Group A task 7: the keepsake download routes — auth, the read-only period,
// parts and headers. The data layer is mocked; tests/supabase/keepsake_download
// covers the real gathering.

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    throw new Error("DB access in a route unit test");
  },
}));
vi.mock("@/lib/couple/keepsake/load", () => ({ loadKeepsake: vi.fn(async () => keepsakeFixture()) }));

function file(name: string, text: string) {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    bytes: bytes.length,
    kind: "album" as const,
    open: async () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      }),
  };
}
vi.mock("@/lib/couple/keepsake/media", () => ({
  planKeepsakeMedia: vi.fn(async () => [[file("Покана/Покана.jpg", "a"), file("Видео честитки/Ана.mp4", "b")], [file("Фотографии и видеа/001-x.jpg", "c")]]),
}));

const { GET: book } = await import("@/app/api/couple/download/book/route");
const { GET: media } = await import("@/app/api/couple/download/media/route");
const { GET: tables } = await import("@/app/api/couple/download/tables/route");

function request(path: string, headers: Record<string, string> = { "x-couple-event-id": "e1" }) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("keepsake download routes", () => {
  it("refuse a request without a couple session", async () => {
    for (const [route, path] of [[book, "/api/couple/download/book"], [tables, "/api/couple/download/tables"], [media, "/api/couple/download/media?part=1"]] as const) {
      const res = await route(request(path, {}), { params: {} });
      expect(res.status).toBe(401);
    }
  });

  it("serve the book in the read-only period, as a PDF named in Cyrillic", async () => {
    const res = await book(request("/api/couple/download/book", { "x-couple-event-id": "e1", "x-couple-access-phase": "memories" }), { params: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="svadbena-kniga.pdf"; filename*=UTF-8''${encodeURIComponent("Свадбена книга — Ана & Марко.pdf")}`,
    );
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("stream each media part and refuse a part that does not exist", async () => {
    const res = await media(request("/api/couple/download/media?part=2", { "x-couple-event-id": "e1", "x-couple-access-phase": "memories" }), { params: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain(`filename*=UTF-8''${encodeURIComponent("Фотографии и видеа — дел 2 од 2.zip")}`);
    const zip = Buffer.from(await res.arrayBuffer());
    expect(zip.includes(Buffer.from("Фотографии и видеа/001-x.jpg"))).toBe(true);
    expect(zip.includes(Buffer.from("Покана/Покана.jpg"))).toBe(false);

    for (const part of ["0", "3", "x"]) {
      expect((await media(request(`/api/couple/download/media?part=${part}`), { params: {} })).status).toBe(400);
    }
  });

  it("plan every part from the files added before the page's pin, and refuse a pin that isn't a timestamp", async () => {
    const { planKeepsakeMedia } = await import("@/lib/couple/keepsake/media");
    vi.mocked(planKeepsakeMedia).mockClear();
    const pin = "2027-07-01T10:00:00.000Z";
    expect((await media(request(`/api/couple/download/media?part=1&before=${encodeURIComponent(pin)}`), { params: {} })).status).toBe(200);
    expect(planKeepsakeMedia).toHaveBeenCalledWith("e1", pin);
    // An old link without a pin plans from every file.
    expect((await media(request("/api/couple/download/media?part=1"), { params: {} })).status).toBe(200);
    expect(planKeepsakeMedia).toHaveBeenLastCalledWith("e1", undefined);
    for (const bad of ["yesterday", "2027-07-01", "2027-13-45T00:00:00Z"]) {
      expect((await media(request(`/api/couple/download/media?part=1&before=${bad}`), { params: {} })).status, bad).toBe(400);
    }
  });
});
