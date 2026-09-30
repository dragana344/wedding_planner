// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";

// Same failure as Session 4's album confirm (tests/lib/pure/media-object-head):
// under Next.js's patched fetch, cancelling a response body that has already
// delivered the bytes asked for never settles, so awaiting it hung the
// couple's invitation-photo confirm forever.

const EVENT = "11111111-1111-4111-8111-111111111111";
const UPLOAD = `uploads/${EVENT}/22222222-2222-4222-8222-222222222222`;

vi.mock("@/lib/storage-cleanup", () => ({ drainStorageCleanupQueue: async () => ({ removed: 0 }) }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://storage.test/x" }, error: null }),
        move: async () => ({ error: null }),
        remove: async () => ({ error: null }),
      }),
    },
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}));

afterEach(() => vi.unstubAllGlobals());

function responseWithStuckCancel(bytes: Uint8Array) {
  let sent = false;
  return {
    ok: true,
    status: 206,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true, value: undefined } : ((sent = true), { done: false, value: bytes })),
        cancel: () => new Promise<void>(() => {}), // never settles
        releaseLock: () => {},
      }),
    },
  };
}

describe("confirmInvitationPhotoUpload", () => {
  it("finishes even when cancelling the ranged download never settles", async () => {
    const jpeg = new Uint8Array(32);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    vi.stubGlobal("fetch", vi.fn(async () => responseWithStuckCancel(jpeg)));
    const { confirmInvitationPhotoUpload } = await import("@/lib/couple/invitations");

    const result = await Promise.race([
      confirmInvitationPhotoUpload(EVENT, UPLOAD),
      new Promise((resolve) => setTimeout(() => resolve("HUNG"), 1000)),
    ]);
    expect(result).toMatch(new RegExp(`^${EVENT}-\\d+\\.jpg$`));
  });
});
