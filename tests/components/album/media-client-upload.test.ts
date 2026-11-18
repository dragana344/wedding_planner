import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ supabaseUrl: () => "http://storage.test", supabaseAnonKey: () => "anon" }));

import { UPLOAD_CONNECTION_LOST, UPLOAD_EXPIRED, UPLOAD_FAILED, UPLOAD_REFUSED_TOO_BIG, signedUpload } from "@/components/album/media-client";

const blob = new Blob(["x"], { type: "video/mp4" });

/** First fetch = our API's signed URL, second = the PUT to storage. */
function stubFetch(put: () => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.startsWith("/api/")
        ? Promise.resolve(new Response(JSON.stringify({ path: "p", token: "t", bucket: "b" }), { status: 200 }))
        : put(),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("signedUpload error messages", () => {
  it("says the file is too big when storage answers 413", async () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 413 })));
    await expect(signedUpload("/api/x", blob)).rejects.toThrow(UPLOAD_REFUSED_TOO_BIG);
  });

  it("says the connection dropped when the request gets no answer", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(signedUpload("/api/x", blob)).rejects.toThrow(UPLOAD_CONNECTION_LOST);
  });

  it("says the link expired on 401/403", async () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 403 })));
    await expect(signedUpload("/api/x", blob)).rejects.toThrow(UPLOAD_EXPIRED);
  });

  it("keeps the generic message for anything else", async () => {
    stubFetch(() => Promise.resolve(new Response("{}", { status: 500 })));
    await expect(signedUpload("/api/x", blob)).rejects.toThrow(UPLOAD_FAILED);
  });
});
