import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CustomMenuBuilder } from "@/components/couple/CustomMenuBuilder";
import type { MenuItemTier } from "@/lib/venue/menus";

const items = [
  { id: "i1", venue_id: "v1", tiers: ["special"] as MenuItemTier[], course: "starter" as const, name: "Soup", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null },
  { id: "i2", venue_id: "v1", tiers: ["special"] as MenuItemTier[], course: "main" as const, name: "Steak", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null },
];

function makeDataTransfer(itemId: string) {
  const store: Record<string, string> = {};
  return {
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? itemId,
  } as unknown as DataTransfer;
}

describe("CustomMenuBuilder", () => {
  it("moves an item from available to selected on drop, and can remove it again", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<CustomMenuBuilder items={items} currentSelection={{ mode: "none" }} />);

    expect(screen.getByTestId("available-item-i1")).toBeInTheDocument();
    expect(screen.queryByTestId("selected-item-i1")).not.toBeInTheDocument();

    const dropZone = screen.getByTestId("custom-menu-drop-zone");
    fireEvent.dragOver(dropZone);
    fireEvent.drop(dropZone, { dataTransfer: makeDataTransfer("i1") });

    expect(screen.queryByTestId("available-item-i1")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-item-i1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /зачувај сопствено мени/i }));
    expect(await screen.findByText("Зачувано")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/menu",
      expect.objectContaining({ body: JSON.stringify({ mode: "custom", menu_item_ids: ["i1"] }) })
    );
  });

  it("shows a guest-count input for each item once a course has 2+ selected items, and saves quantities on submit", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const twoMains = [
      { id: "i1", venue_id: "v1", tiers: ["special"] as MenuItemTier[], course: "main" as const, name: "Chicken", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null },
      { id: "i2", venue_id: "v1", tiers: ["special"] as MenuItemTier[], course: "main" as const, name: "Veg", allergen_tags: [], is_vegetarian: true, is_vegan: false, price: null, photo_path: null },
    ];
    render(<CustomMenuBuilder items={twoMains} currentSelection={{ mode: "none" }} />);

    const dropZone = screen.getByTestId("custom-menu-drop-zone");
    fireEvent.drop(dropZone, { dataTransfer: makeDataTransfer("i1") });
    fireEvent.drop(dropZone, { dataTransfer: makeDataTransfer("i2") });

    const vegCountInput = screen.getByLabelText(/број на гости за veg/i);
    fireEvent.change(vegCountInput, { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /зачувај сопствено мени/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/menu/quantities",
        expect.objectContaining({
          body: JSON.stringify({ quantities: [{ menu_item_id: "i1", guest_count: null }, { menu_item_id: "i2", guest_count: 5 }] }),
        })
      )
    );
  });
});
