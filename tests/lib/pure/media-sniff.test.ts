import { describe, it, expect } from "vitest";
import { sniffVideoType } from "@/lib/media/sniff";

const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 0x18, ...Array.from(Buffer.from(`ftyp${brand}`))]);

describe("sniffVideoType", () => {
  it("recognises MP4 brands", () => {
    expect(sniffVideoType(ftyp("isom"))).toBe("mp4");
    expect(sniffVideoType(ftyp("mp42"))).toBe("mp4");
  });

  it("recognises QuickTime (iPhone) as mov", () => {
    expect(sniffVideoType(ftyp("qt  "))).toBe("mov");
  });

  it("recognises WebM by its EBML header", () => {
    expect(sniffVideoType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe("webm");
  });

  it("refuses images, AVIF and short input", () => {
    expect(sniffVideoType(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffVideoType(ftyp("avif"))).toBeNull();
    expect(sniffVideoType(new Uint8Array([0, 0]))).toBeNull();
  });
});
