// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sniffImageType } from "@/lib/image-type";

const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffImageType (SEC-005)", () => {
  it("recognises the supported raster formats by their magic bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffImageType(text("GIF89a......"))).toBe("gif");
    expect(sniffImageType(text("RIFF\x00\x00\x00\x00WEBPVP8 "))).toBe("webp");
    expect(sniffImageType(Uint8Array.from([0, 0, 0, 0x1c, ...text("ftypavif")]))).toBe("avif");
  });

  it("refuses SVG, HTML, PDF, HEIC and empty files, whatever they are named", () => {
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'))).toBeNull();
    expect(sniffImageType(text("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(text("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0, 0, 0, 0x18, ...text("ftypheic")]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
