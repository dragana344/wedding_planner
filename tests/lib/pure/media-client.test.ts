import { describe, it, expect, vi, afterEach } from "vitest";
import { compressImage, PhotoProcessError } from "@/components/album/media-client";

// Review focus 1: a photo the browser cannot decode (HEIC on Android/Chrome)
// must fail loudly with a message the guest understands.

afterEach(() => vi.unstubAllGlobals());

describe("compressImage", () => {
  it("refuses a photo the browser cannot decode", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new DOMException("bad", "InvalidStateError"); }));
    const file = new File(["heic"], "IMG_1.HEIC", { type: "image/heic" });
    await expect(compressImage(file)).rejects.toBeInstanceOf(PhotoProcessError);
    await expect(compressImage(file)).rejects.toThrow("Оваа фотографија не може да се обработи. Обидете се со JPEG или направете screenshot.");
  });

  it("re-encodes to JPEG within 2560 px, keeping the aspect ratio", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close })));
    const drawImage = vi.fn();
    class FakeCanvas {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage };
      }
      async convertToBlob(opts: { type: string; quality: number }) {
        return new Blob(["jpeg"], { type: opts.type });
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);

    const out = await compressImage(new File(["x"], "big.jpg", { type: "image/jpeg" }));
    expect(out).toMatchObject({ width: 2560, height: 1920 });
    expect(out.blob.type).toBe("image/jpeg");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2560, 1920);
    expect(close).toHaveBeenCalled();
  });
});
