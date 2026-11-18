import { describe, it, expect } from "vitest";
import { buildCoupleNavItems, matchCoupleNavItem } from "@/components/couple/shell/nav";
import { COUPLE_DOWNLOADS_HREF } from "@/lib/couple/access";

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

  it("places the vendor-partners entry right after Известувања, ungated", () => {
    const items = buildCoupleNavItems([]);
    const notifIndex = items.findIndex((i) => i.href === "/couple/notifications");
    const partnersIndex = items.findIndex((i) => i.href === "/couple/partners");
    expect(partnersIndex).toBe(notifIndex + 1);
    expect(items[partnersIndex].feature).toBeUndefined();
  });
});

describe("couple navigation: downloads", () => {
  it("lists the keepsake download, never locked (group A task 7)", () => {
    const item = buildCoupleNavItems([]).find((i) => i.href === COUPLE_DOWNLOADS_HREF);
    expect(item).toBeDefined();
    expect(item!.feature).toBeUndefined();
  });
});

describe("matchCoupleNavItem", () => {
  const items = buildCoupleNavItems([]);

  it("matches the exact and prefixed routes", () => {
    expect(matchCoupleNavItem("/couple", items)?.href).toBe("/couple");
    expect(matchCoupleNavItem("/couple/budget", items)?.href).toBe("/couple/budget");
  });

  it("returns undefined for a route with no nav entry (e.g. /couple/packages), instead of falling back to the first item", () => {
    expect(matchCoupleNavItem("/couple/packages", items)).toBeUndefined();
  });
});
