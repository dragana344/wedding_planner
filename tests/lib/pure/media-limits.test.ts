import { describe, it, expect } from "vitest";
import { fitWithin, fitsQuota, formatBytes, retentionDays, storageBreakdown, storageLimitBytes } from "@/lib/media/limits";

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

describe("storage quota from the plan (storage_gb)", () => {
  const GB = 1024 ** 3;
  it("turns the resolved storage_gb into bytes; null is unlimited, disabled is nothing", () => {
    expect(storageLimitBytes({ enabled: true, limit: 20 })).toBe(20 * GB);
    expect(storageLimitBytes({ enabled: true, limit: 0 })).toBe(0);
    expect(storageLimitBytes({ enabled: true, limit: null })).toBeNull();
    expect(storageLimitBytes({ enabled: false, limit: null })).toBe(0);
    expect(storageLimitBytes({ enabled: false, limit: 5 })).toBe(0);
  });

  it("fits a file up to the limit exactly, and always when unlimited", () => {
    expect(fitsQuota(100, 60, 40)).toBe(true);
    expect(fitsQuota(100, 60, 41)).toBe(false);
    expect(fitsQuota(0, 0, 1)).toBe(false);
    expect(fitsQuota(null, 10 * GB, 10 * GB)).toBe(true);
  });

  it("breaks down unlimited space as the split of what is used", () => {
    expect(storageBreakdown({ limitBytes: null, photoBytes: 30, videoBytes: 10 })).toEqual({
      usedBytes: 40, freeBytes: null, photoPct: 75, videoPct: 25, freePct: 0, full: false,
    });
    expect(storageBreakdown({ limitBytes: null, photoBytes: 0, videoBytes: 0 }).videoPct).toBe(0);
  });
});

describe("album retention from the plan (photo_retention_days)", () => {
  it("purges only for an enabled feature with a positive limit; everything else keeps forever", () => {
    expect(retentionDays({ enabled: true, limit: 30 })).toBe(30);
    expect(retentionDays({ enabled: true, limit: 30.7 })).toBe(30);
    expect(retentionDays({ enabled: true, limit: null })).toBeNull();
    expect(retentionDays({ enabled: true, limit: 0 })).toBeNull();
    expect(retentionDays({ enabled: true, limit: -3 })).toBeNull();
    expect(retentionDays({ enabled: false, limit: 0 })).toBeNull();
    expect(retentionDays({ enabled: false, limit: 15 })).toBeNull();
    expect(retentionDays(undefined)).toBeNull();
  });
});
