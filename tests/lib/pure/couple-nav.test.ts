import { describe, it, expect } from "vitest";
import { buildCoupleNavItems } from "@/components/couple/shell/nav";

// D3: no "coming soon" placeholders in the couple's navigation.
describe("couple navigation", () => {
  it("has no placeholder items", () => {
    const items = buildCoupleNavItems([{ id: "r1", name: "Сала" }]);
    expect(items.filter((i) => !i.ready)).toEqual([]);
  });

  it("hides the unfinished messages page and lists album and greetings", () => {
    const hrefs = buildCoupleNavItems([]).map((i) => i.href);
    expect(hrefs).not.toContain("/couple/messages");
    expect(hrefs).toEqual(expect.arrayContaining(["/couple/album", "/couple/greetings"]));
  });
});
