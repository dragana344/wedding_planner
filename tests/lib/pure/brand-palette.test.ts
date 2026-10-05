import { describe, it, expect } from "vitest";
import { brandVars, contrastRatio, normalizeBrandColor } from "@/lib/venue/brand-palette";

describe("normalizeBrandColor", () => {
  it("accepts a six-digit hex colour in any case and trims it", () => {
    expect(normalizeBrandColor(" #0E9F95 ")).toBe("#0e9f95");
  });
  it("refuses anything else", () => {
    for (const bad of ["", "red", "#fff", "0e9f95", "#0e9f9z", null, undefined, "url(javascript:alert(1))"]) expect(normalizeBrandColor(bad)).toBeNull();
  });
});

describe("brandVars", () => {
  it("returns nothing without a valid colour, so the panel keeps its gold", () => {
    expect(brandVars(null)).toBeNull();
    expect(brandVars("blue")).toBeNull();
  });

  it("keeps the picked colour as the accent", () => {
    expect(brandVars("#0E9F95")!["--gold"]).toBe("#0e9f95");
  });

  // A palette of very different colours: the text on the accent, and the
  // accent used as text on white, must stay readable for every one of them.
  const colours = ["#c9992f", "#0e9f95", "#7b3aed", "#e5184a", "#111827", "#fde047", "#ffffff", "#000000", "#94a3b8"];
  // Buttons run from the lighter shade to the accent, so the text has to hold
  // on both ends. (Mid-tones cannot reach 4.5:1 with either text colour; 3:1
  // is the bar for the large, bold labels these surfaces carry.)
  it.each(colours)("text on %s is readable across the whole button", (colour) => {
    const vars = brandVars(colour)!;
    expect(contrastRatio(vars["--gold"], vars["--on-gold"])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(vars["--gold-hi"], vars["--on-gold"])).toBeGreaterThanOrEqual(3);
  });
  it.each(colours)("%s as text and as icon colour reads on white", (colour) => {
    const vars = brandVars(colour)!;
    expect(contrastRatio(vars["--gold-text"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(vars["--gold-lo"], "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it.each(colours)("%s stays visible on the dark sidebar, with readable text on it", (colour) => {
    const vars = brandVars(colour)!;
    expect(contrastRatio(vars["--side-gold"], "#14161b")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(vars["--side-gold"], vars["--side-on-gold"])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(vars["--side-gold-hi"], vars["--side-on-gold"])).toBeGreaterThanOrEqual(3);
  });

  it("leaves a colour that already shows on the sidebar unchanged there", () => {
    expect(brandVars("#0e9f95")!["--side-gold"]).toBe("#0e9f95");
    expect(brandVars("#111827")!["--side-gold"]).not.toBe("#111827");
  });

  it("picks white text on a dark colour and dark text on a light one", () => {
    expect(brandVars("#111827")!["--on-gold"]).toBe("#ffffff");
    expect(brandVars("#fde047")!["--on-gold"]).toBe("#1b1508");
  });

  it("only ever emits hex colours and one fixed rgba, never the raw input", () => {
    for (const value of Object.values(brandVars("#0e9f95")!)) expect(value).toMatch(/^(#[0-9a-f]{6}|rgba\(255, 255, 255, 0\.86\))$/);
  });
});
