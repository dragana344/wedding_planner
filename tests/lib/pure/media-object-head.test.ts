// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";

// Found by the e2e run: under Next.js's patched fetch, cancelling a response
// body that has already been read to its end never settles, so awaiting the
// cancel hung the guest's confirm request forever. readObjectHead must return
// as soon as it has the bytes it needs, whatever the cancel does.

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://storage.test/x" }, error: null }) }) },
  }),
}));

afterEach(() => vi.unstubAllGlobals());

function responseWithStuckCancel(bytes: Uint8Array, total: number) {
  let sent = false;
  const body = {
    getReader: () => ({
      read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes })),
      cancel: () => new Promise<void>(() => {}), // never settles
      releaseLock: () => {},
    }),
    cancel: () => new Promise<void>(() => {}),
  };
  return { ok: true, status: 206, body, headers: new Headers({ "content-range": `bytes 0-${bytes.length - 1}/${total}` }) };
}

describe("readObjectHead", () => {
  it("returns the head and full size even when cancelling the body never settles", async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    vi.stubGlobal("fetch", vi.fn(async () => responseWithStuckCancel(jpeg, 12345)));
    const { readObjectHead } = await import("@/lib/media/storage");

    const result = await Promise.race([
      readObjectHead("pending/e/x"),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 1000)),
    ]);
    expect(result).toEqual({ head: jpeg, size: 12345 });
  });
});
