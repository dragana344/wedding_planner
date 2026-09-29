import { describe, it, expect } from "vitest";
import { fitWithin, formatBytes, storageBreakdown } from "@/lib/media/limits";

describe("formatBytes", () => {
  it("shows gigabytes with one decimal and a Macedonian decimal comma", () => {
    expect(formatBytes(13.2 * 1024 ** 3)).toBe("13,2 GB");
    expect(formatBytes(20 * 1024 ** 3)).toBe("20 GB");
  });

  it("shows whole megabytes below a gigabyte", () => {
    expect(formatBytes(850 * 1024 ** 2)).toBe("850 MB");
    expect(formatBytes(0)).toBe("0 MB");
  });
});

describe("storageBreakdown", () => {
  it("splits the limit into photos, videos and what is left", () => {
    expect(storageBreakdown({ limitBytes: 100, photoBytes: 60, videoBytes: 30 })).toEqual({
      usedBytes: 90, freeBytes: 10, photoPct: 60, videoPct: 30, freePct: 10, full: false,
    });
  });

  it("clamps an over-full album to 100 % with nothing free", () => {
    const b = storageBreakdown({ limitBytes: 100, photoBytes: 90, videoBytes: 30 });
    expect(b.full).toBe(true);
    expect(b.freeBytes).toBe(0);
    expect(b.freePct).toBe(0);
    expect(b.photoPct + b.videoPct).toBe(100);
  });
});

describe("fitWithin", () => {
  it("scales the longer edge down to the maximum, keeping the ratio", () => {
    expect(fitWithin(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 });
  });

  it("leaves smaller images alone", () => {
    expect(fitWithin(1000, 800, 2560)).toEqual({ width: 1000, height: 800 });
  });
});
