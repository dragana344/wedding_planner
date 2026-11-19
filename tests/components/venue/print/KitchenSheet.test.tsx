import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KitchenSheet } from "@/components/venue/print/KitchenSheet";
import type { KitchenSheetData } from "@/lib/venue/kitchen-sheet";

const base: KitchenSheetData = {
  title: "Ана и Марко",
  date: "01.06.2030",
  start: "19:00",
  halls: ["Голема сала"],
  generatedAt: "20.05.2030 12:00",
  latest: {
    id: "s1", sentAt: "2030-05-18T08:00:00Z", sentBy: "Младенците", seenAt: null, seenBy: null, source: "couple",
    unanswered: 5, allergySummary: null, allergyNotes: null,
    numbers: { menus: [{ id: "a", name: "Месо", count: 150 }], total: 150, noMeal: 6 },
    estimate: { menus: [{ id: "a", name: "Месо", count: 24 }], total: 24 },
  },
  menus: [{ id: "a", name: "Месо", count: 174, estimated: 24 }],
  meals: 174,
  estimated: 24,
  noMeal: 6,
  headcount: 180,
  allergySummary: null,
  allergyTables: [{ table: "Маса 3", notes: [{ guestName: "Ана", menuName: "Месо", text: "ореви" }] }],
  allergyUnseated: [{ guestName: "Бојан", menuName: "Месо", text: "млеко" }],
  changes: [{ id: "c1", text: "19.05.2030 10:00 · +2 Месо" }],
};

describe("KitchenSheet", () => {
  it("prints the headcount, menus with the estimate marked, no-meal, allergies by table and the changes", () => {
    render(<KitchenSheet data={base} />);
    expect(screen.getByRole("heading", { name: "Лист за кујна — Ана и Марко" })).toBeInTheDocument();
    expect(screen.getByText("01.06.2030 · 19:00 · Голема сала")).toBeInTheDocument();
    expect(screen.getByText(/Вкупно лица:/)).toHaveTextContent("Вкупно лица: 180 (од кои проценка: 24)");
    expect(screen.getByText("174 (од кои проценка: 24)")).toBeInTheDocument();
    const noMealRow = screen.getByText("Деца без оброк").closest("tr")!;
    expect(within(noMealRow).getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Маса 3")).toBeInTheDocument();
    expect(screen.getByText("Без место")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("+2 Месо");
    expect(screen.getByText(/Генерирано на 20.05.2030 12:00/)).toBeInTheDocument();
    expect(screen.getByText(/5 гости немаа одговор/)).toBeInTheDocument();
  });

  it("the couple's allergy summary replaces the table; nothing sent shows a plain note", () => {
    const { unmount } = render(<KitchenSheet data={{ ...base, allergySummary: "2 без ореви", allergyTables: [], allergyUnseated: [] }} />);
    expect(screen.getByText("2 без ореви")).toBeInTheDocument();
    unmount();
    render(<KitchenSheet data={{ ...base, latest: null, menus: [], changes: [] }} />);
    expect(screen.getByText("Парот сè уште не ги испратил бројките за мени.")).toBeInTheDocument();
    expect(screen.queryByText("Менија")).toBeNull();
  });
});
