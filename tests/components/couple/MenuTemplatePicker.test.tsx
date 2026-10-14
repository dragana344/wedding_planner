import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MenuTemplatePicker } from "@/components/couple/MenuTemplatePicker";
import type { MenuItem, MenuTemplate } from "@/lib/venue/menus";

function mainItem(id: string, name: string): MenuItem {
  return { id, venue_id: "v1", tiers: ["special"], course: "main", name, allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null };
}

const template: MenuTemplate & { items: MenuItem[] } = {
  id: "t1",
  venue_id: "v1",
  name: "Свадбено",
  description: null,
  items: [mainItem("i1", "Пилешко"), mainItem("i2", "Говедско")],
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

describe("MenuTemplatePicker", () => {
  it("saves per-dish guest counts for an already-selected template, without re-selecting it", async () => {
    render(
      <MenuTemplatePicker
        templates={[template]}
        currentSelection={{ mode: "template", menuTemplateId: "t1" }}
        initialQuantities={[]}
        guestCountEstimate={100}
      />
    );

    // The select button is disabled (already chosen) — editing quantities
    // must not depend on it.
    expect(screen.getByRole("button", { name: "Избрано" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Број на гости за Пилешко"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај бројки" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/menu/quantities",
        expect.objectContaining({
          body: JSON.stringify({
            quantities: [
              { menu_item_id: "i1", guest_count: 60 },
              { menu_item_id: "i2", guest_count: null },
            ],
          }),
        })
      )
    );
    // Only the quantities endpoint is hit — selecting the template again is
    // neither needed nor attempted.
    expect(global.fetch).not.toHaveBeenCalledWith("/api/couple/menu", expect.anything());
  });

  it("does not offer the quantities save button before any template is selected", () => {
    render(<MenuTemplatePicker templates={[template]} currentSelection={{ mode: "none" }} />);
    expect(screen.queryByRole("button", { name: "Зачувај бројки" })).not.toBeInTheDocument();
  });
});
