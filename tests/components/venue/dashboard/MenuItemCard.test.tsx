import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/venue/menus", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMenuItemPhotoUrl: (path: string | null) => (path ? `https://cdn.test/${path}` : null),
}));

import { MenuItemCard } from "@/components/venue/dashboard/MenuItemCard";
import type { MenuItem } from "@/lib/venue/menus";

const item = {
  id: "d1", venue_id: "v1", tiers: ["special"], course: "main", name: "Пиле", allergen_tags: [],
  is_vegetarian: false, is_vegan: false, price: 500, photo_path: "v1/d1.jpg",
} as MenuItem;

describe("MenuItemCard keyboard", () => {
  it("Enter on the photo button opens only the photo, not the edit window", () => {
    render(<MenuItemCard item={item} venueId="v1" onChanged={() => {}} />);
    const photoButton = screen.getByRole("button", { name: "Погледни фотографија на Пиле" });
    fireEvent.keyDown(photoButton, { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Зачувај промени" })).not.toBeInTheDocument();
  });

  it("Enter or Space on the row opens the edit window, without scrolling the page", () => {
    render(<MenuItemCard item={item} venueId="v1" onChanged={() => {}} />);
    const row = screen.getAllByRole("button")[0];
    const space = fireEvent.keyDown(row, { key: " " });
    expect(space).toBe(false); // default (page scroll) prevented
    expect(screen.getByRole("button", { name: "Зачувај промени" })).toBeInTheDocument();
  });

  it("closes the photo with a Macedonian-labelled button", () => {
    render(<MenuItemCard item={item} venueId="v1" onChanged={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Погледни фотографија на Пиле" }));
    expect(screen.getByRole("button", { name: "Затвори" })).toBeInTheDocument();
  });
});
