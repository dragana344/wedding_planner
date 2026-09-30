import { describe, it, expect } from "vitest";
import { qrSvg, tableQrTarget } from "@/lib/seating/qr";

describe("table QR codes", () => {
  it("opens the invitation at \"Каде седам?\" (Session 2's seat lookup)", () => {
    expect(tableQrTarget("https://kadesum.mk", "ana-marko")).toBe("https://kadesum.mk/invite/ana-marko#kade-sedam");
    expect(tableQrTarget("https://kadesum.mk/", "ana-marko")).toBe("https://kadesum.mk/invite/ana-marko#kade-sedam");
    expect(tableQrTarget("https://kadesum.mk", null)).toBe("https://kadesum.mk");
  });

  it("draws an SVG", async () => {
    const svg = await qrSvg("https://kadesum.mk/invite/ana-marko");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
  });
});
