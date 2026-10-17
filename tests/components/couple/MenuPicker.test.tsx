import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// next/font is compiled by Next, not available under jsdom.
vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ className: "font" }),
}));

import { MenuPicker } from "@/components/couple/MenuPicker";
import type { MenuItem, MenuTemplate } from "@/lib/venue/menus";

function item(id: string, course: MenuItem["course"], name: string): MenuItem {
  return { id, venue_id: "v1", tiers: ["special"], course, name, allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null };
}

const chicken = item("i1", "main", "Пилешко");
const beef = item("i2", "main", "Говедско");
const soup = item("i3", "starter", "Супа");

const template: MenuTemplate & { items: MenuItem[] } = {
  id: "t1",
  venue_id: "v1",
  name: "Класично",
  description: null,
  items: [soup, chicken],
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
});

function sentBody(call: number) {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[call][1].body);
}

describe("MenuPicker", () => {
  it("shows the venue's ready-made templates and the flat dish list pooled from templates + special items", () => {
    render(
      <MenuPicker
        templates={[template]}
        specialItems={[beef]}
        currentSelection={{ mode: "none" }}
        coupleNames="Ана и Марко"
        eventDate="2026-10-18"
      />,
    );
    expect(screen.getByText("Класично")).toBeInTheDocument();
    expect(screen.getByText("Пилешко")).toBeInTheDocument();
    expect(screen.getByText("Говедско")).toBeInTheDocument();
    expect(screen.getByText("Супа")).toBeInTheDocument();
  });

  it("clicking a template card pre-selects its dishes, shown in the live preview", () => {
    render(
      <MenuPicker
        templates={[template]}
        specialItems={[beef]}
        currentSelection={{ mode: "none" }}
        coupleNames="Ана и Марко"
        eventDate="2026-10-18"
      />,
    );
    fireEvent.click(screen.getByText("Класично"));
    // The preview card now shows the template's two dishes as "✓ Во менито" in the list...
    expect(screen.getAllByRole("button", { name: /Во менито/ })).toHaveLength(2);
  });

  it("adding a dish from the flat list toggles it into the menu, and clicking again removes it", () => {
    render(
      <MenuPicker
        templates={[]}
        specialItems={[chicken]}
        currentSelection={{ mode: "none" }}
        coupleNames="Ана и Марко"
        eventDate="2026-10-18"
      />,
    );
    const addButton = screen.getByRole("button", { name: "+ Додај" });
    fireEvent.click(addButton);
    expect(screen.getByRole("button", { name: /Во менито/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Во менито/ }));
    expect(screen.getByRole("button", { name: "+ Додај" })).toBeInTheDocument();
  });

  it("saves as mode: template when the pick exactly matches a template's dishes", async () => {
    render(
      <MenuPicker
        templates={[template]}
        specialItems={[]}
        currentSelection={{ mode: "none" }}
        coupleNames="Ана и Марко"
        eventDate="2026-10-18"
      />,
    );
    fireEvent.click(screen.getByText("Класично"));
    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/couple/menu", expect.anything()));
    expect(sentBody(0)).toEqual({ mode: "template", menu_template_id: "t1" });
  });

  it("saves as mode: custom when the pick doesn't match any whole template", async () => {
    render(
      <MenuPicker
        templates={[template]}
        specialItems={[beef]}
        currentSelection={{ mode: "none" }}
        coupleNames="Ана и Марко"
        eventDate="2026-10-18"
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "+ Додај" })[0]); // just the beef, not the whole template
    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/couple/menu", expect.anything()));
    expect(sentBody(0)).toEqual({ mode: "custom", menu_item_ids: ["i2"] });
  });

  it("shows a per-dish guest-count input once a course has 2+ selected items, and blocks saving with 2+ blanks", async () => {
    render(
      <MenuPicker
        templates={[]}
        specialItems={[chicken, beef]}
        currentSelection={{ mode: "none" }}
        guestCountEstimate={100}
        coupleNames="Ана и Марко"
        eventDate="2026-10-18"
      />,
    );
    const addButtons = screen.getAllByRole("button", { name: "+ Додај" });
    fireEvent.click(addButtons[0]);
    fireEvent.click(addButtons[1]);

    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));
    expect(await screen.findByText("Поправете ги бројките на гости подолу пред да зачувате.")).toBeInTheDocument();
    expect(screen.getByText("Само едно јадење по категорија може да остане без бројка.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/couple/menu", expect.anything());

    fireEvent.change(screen.getByLabelText("Број на гости за Говедско"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/menu/quantities",
        expect.objectContaining({
          body: JSON.stringify({
            quantities: [
              { menu_item_id: "i1", guest_count: null },
              { menu_item_id: "i2", guest_count: 40 },
            ],
          }),
        }),
      ),
    );
  });

  it("refuses to save an empty selection", () => {
    render(
      <MenuPicker templates={[]} specialItems={[chicken]} currentSelection={{ mode: "none" }} coupleNames="Ана и Марко" eventDate="2026-10-18" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));
    expect(screen.getByText("Изберете барем едно јадење.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("starts from the couple's already-saved selection", () => {
    render(
      <MenuPicker
        templates={[template]}
        specialItems={[beef]}
        currentSelection={{ mode: "template", menuTemplateId: "t1" }}
        coupleNames="Ана и Марко"
        eventDate="2026-10-18"
      />,
    );
    expect(screen.getAllByRole("button", { name: /Во менито/ })).toHaveLength(2);
  });
});
