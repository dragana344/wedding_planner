import { describe, it, expect } from "vitest";
import { mapsHref } from "@/lib/couple/invitation-program";
import { INVITATION_TEMPLATES } from "@/lib/couple/invitation-templates";

describe("mapsHref (A14)", () => {
  it("uses the couple's map link when it is http(s)", () => {
    expect(mapsHref({ address: "Ул. Македонија 1", map_url: "https://maps.app.goo.gl/abc" })).toBe("https://maps.app.goo.gl/abc");
  });

  it("never passes on a script or other scheme; falls back to a search for the address", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", " JAVASCRIPT:alert(1)", "vbscript:x", "//evil.example"]) {
      expect(mapsHref({ address: "Радовиш", map_url: bad })).toBe("https://www.google.com/maps/search/?api=1&query=%D0%A0%D0%B0%D0%B4%D0%BE%D0%B2%D0%B8%D1%88");
    }
  });

  it("gives nothing without a usable link or address", () => {
    expect(mapsHref({ address: null, map_url: null })).toBeNull();
    expect(mapsHref({ address: "  ", map_url: "javascript:x" })).toBeNull();
  });
});

describe("invitation templates (A13)", () => {
  it("offers three basic and three premium templates (owner decision)", () => {
    expect(INVITATION_TEMPLATES.filter((t) => t.premium).map((t) => t.id)).toEqual(["modern-watercolor", "rustic", "royal-green"]);
    expect(INVITATION_TEMPLATES.filter((t) => !t.premium).map((t) => t.id)).toEqual(["romantic-floral", "elegant-gold", "classic-minimal"]);
  });
});
