import { describe, it, expect } from "vitest";
import { VENUE_LEGEND, COUPLE_LEGEND, venueKindColor, coupleKindColor, isNotificationColor } from "@/lib/notification-colors";

describe("notification colours", () => {
  it("maps every venue kind to its colour", () => {
    expect(venueKindColor("couple_change")).toBe("yellow");
    expect(venueKindColor("menu_numbers")).toBe("green");
    expect(venueKindColor("event_created")).toBe("blue");
    expect(venueKindColor("event_deleted")).toBe("blue");
    expect(venueKindColor("credentials_created")).toBe("grey");
    expect(venueKindColor("password_regenerated")).toBe("grey");
    expect(venueKindColor("data_erased")).toBe("red");
    expect(venueKindColor("data_exported")).toBe("red");
  });

  it("lists the legend in order with the exact labels", () => {
    expect(VENUE_LEGEND).toEqual([
      { color: "yellow", label: "Промени од парот", icon: "send" },
      { color: "green", label: "Бројки за мени", icon: "bookmark" },
      { color: "blue", label: "Настани", icon: "cal" },
      { color: "grey", label: "Пристап", icon: "login" },
      { color: "red", label: "Приватност", icon: "shield" },
    ]);
  });

  it("validates colour strings", () => {
    expect(isNotificationColor("red")).toBe(true);
    expect(isNotificationColor("pink")).toBe(false);
    expect(isNotificationColor(undefined)).toBe(false);
  });

  it("lists the couple legend and maps the couple kinds", () => {
    expect(COUPLE_LEGEND).toEqual([
      { color: "yellow", label: "Промени од салата", icon: "edit" },
      { color: "green", label: "Одговори од гости", icon: "mail" },
      { color: "blue", label: "Потсетници", icon: "bell" },
    ]);
    expect(coupleKindColor("venue_change")).toBe("yellow");
    expect(coupleKindColor("guest_reply")).toBe("green");
    expect(coupleKindColor("reminder")).toBe("blue");
  });
});
