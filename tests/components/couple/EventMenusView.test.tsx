import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ className: "font" }),
}));

import { EventMenusView } from "@/components/couple/EventMenusView";
import type { CoupleEventMenu } from "@/lib/couple/menu";

const menus: CoupleEventMenu[] = [
  {
    id: "m1",
    name: "Класично",
    isCustom: false,
    dishes: [
      { course: "starter", name: "Супа" },
      { course: "main", name: "Пилешко" },
    ],
  },
  { id: "m2", name: "Сопствено мени", isCustom: true, dishes: [{ course: "dessert", name: "Торта" }] },
];

describe("EventMenusView", () => {
  it("view shows each menu's title and dishes, no edit controls", () => {
    render(<EventMenusView menus={menus} />);
    expect(screen.getByRole("heading", { name: "Класично" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Сопствено мени" })).toBeInTheDocument();
    for (const name of ["Супа", "Пилешко", "Торта"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it('no menus: "Салата сè уште нема поставено мени."', () => {
    render(<EventMenusView menus={[]} />);
    expect(screen.getByText("Салата сè уште нема поставено мени.")).toBeInTheDocument();
  });

  it("shows a count per menu only when totals are given", () => {
    const { rerender } = render(<EventMenusView menus={menus} />);
    expect(screen.queryByText("12 гости")).toBeNull();
    rerender(<EventMenusView menus={menus} totals={[{ id: "m1", count: 12 }]} />);
    expect(screen.getByText("12 гости")).toBeInTheDocument();
  });
});
