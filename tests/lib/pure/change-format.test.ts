import { describe, it, expect } from "vitest";
import { describeChange } from "@/lib/changes/format";
import type { EventChange } from "@/lib/changes/types";

function ch(section: EventChange["section"], field: string, oldValue: unknown, newValue: unknown): EventChange {
  return { id: "x", eventId: "e", section, side: "venue", changedBy: null, field, oldValue, newValue, changedAt: "2030-01-01T00:00:00Z" };
}
const show = { redactPrivate: false };
const redact = { redactPrivate: true };

describe("describeChange", () => {
  it("date and time", () => {
    const c = ch("date_time", "date_time",
      { date: "2027-06-01", start: "18:00:00", end: "23:00:00" },
      { date: "2027-06-02", start: "18:00:00", end: "23:00:00" });
    expect(describeChange(c, show)).toBe("01.06.2027 18:00–23:00 → 02.06.2027 18:00–23:00");
  });

  it("date without times", () => {
    const c = ch("date_time", "date_time", { date: "2027-06-01", start: null, end: null }, { date: "2027-06-02", start: "18:00", end: null });
    expect(describeChange(c, show)).toBe("01.06.2027 → 02.06.2027 18:00");
  });

  it("guest count", () => {
    expect(describeChange(ch("guest_count", "guest_count", { count: 120 }, { count: 150 }), show)).toBe("120 → 150");
    expect(describeChange(ch("guest_count", "guest_count", { count: null }, { count: 150 }), show)).toBe("— → 150");
  });

  it("rooms", () => {
    expect(describeChange(ch("rooms", "added", null, { id: "1", name: "Сала А" }), show)).toBe("Додадена: Сала А");
    expect(describeChange(ch("rooms", "removed", { id: "1", name: "Сала А" }, null), show)).toBe("Отстранета: Сала А");
    expect(describeChange(ch("rooms", "added", null, { id: "1", name: null }), show)).toBe("Додадена сала");
    expect(describeChange(ch("rooms", "removed", { id: "1", name: null }, null), show)).toBe("Отстранета сала");
  });

  it("menus", () => {
    expect(describeChange(ch("menus", "added", null, { id: "1", name: "Класично", custom: false }), show)).toBe("Додадено: Класично");
    expect(describeChange(ch("menus", "removed", { id: "1", name: "Посно мени", custom: false }, null), show)).toBe("Отстрането: Посно мени");
    expect(describeChange(ch("menus", "added", null, { id: "1", name: null, custom: null }), show)).toBe("Додадено мени");
    expect(describeChange(ch("menus", "removed", { id: "1", name: null, custom: null }, null), show)).toBe("Отстрането мени");
    expect(describeChange(ch("menus", "renamed", { name: "X" }, { name: "Y" }), show)).toBe("Ново име: X → Y");
    expect(describeChange(ch("menus", "dishes", { menu: "М", dishes: ["A", "B"] }, { menu: "М", dishes: ["A", "C"] }), show)).toBe("Јадења: A, B → A, C");
  });

  it("contact", () => {
    const c = ch("contact", "contact", { email: "a@x.mk", email_2: null, phone: "070" }, { email: "b@x.mk", email_2: null, phone: "070" });
    expect(describeChange(c, show)).toBe("Е-пошта: a@x.mk → b@x.mk");
    expect(describeChange(c, redact)).toBe("Контакт е променет");
    // Erased values: nothing to show.
    expect(describeChange(ch("contact", "contact", null, null), show)).toBe("Контакт е променет");
  });

  it("finance", () => {
    const c = ch("finance", "finance", { total: 100000, deposit: 0 }, { total: 120000, deposit: 0 });
    expect(describeChange(c, show)).toBe("Цена: 100.000 ден → 120.000 ден");
    expect(describeChange(ch("finance", "finance", { total: 1, deposit: 5000 }, { total: 1, deposit: 10000 }), show)).toBe("Платен капар: 5.000 ден → 10.000 ден");
    expect(describeChange(c, redact)).toBe("Финансиите се променети");
  });
});
