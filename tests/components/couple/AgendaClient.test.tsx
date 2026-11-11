import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// next/font is compiled by Next, not available under jsdom.
vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ className: "font" }),
}));

import { AgendaClient } from "@/components/couple/AgendaClient";

const items = [
  { id: "a1", event_id: "e1", time: "16:00", title: "Собирање гости", location: null, notes: null, sort_order: 0 },
  { id: "a2", event_id: "e1", time: "17:00", title: "Церемонија", location: "Црква Св. Климент Охридски", notes: null, sort_order: 1 },
];

describe("AgendaClient", () => {
  it("renders items and adds a new one", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "a3", event_id: "e1", time: "18:00", title: "Вечера", location: "Ресторан Панорама", notes: null, sort_order: 2 }),
    });
    render(<AgendaClient initialItems={items} coupleNames="Ана и Марко" eventDate="2026-10-18" />);

    expect(screen.getByText("Собирање гости")).toBeInTheDocument();
    expect(screen.getByText("Церемонија")).toBeInTheDocument();
    expect(screen.getByText("Црква Св. Климент Охридски")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Наслов"), { target: { value: "Вечера" } });
    fireEvent.change(screen.getByLabelText("Локација (опционално)"), { target: { value: "Ресторан Панорама" } });
    fireEvent.click(screen.getByRole("button", { name: /додади/i }));

    await waitFor(() => expect(screen.getByText("Вечера")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/agenda",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ time: null, title: "Вечера", location: "Ресторан Панорама", notes: null }),
      })
    );
    expect(screen.getByText("Ресторан Панорама")).toBeInTheDocument();
  });

  it("deletes an item", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<AgendaClient initialItems={items} coupleNames="Ана и Марко" eventDate="2026-10-18" />);

    fireEvent.click(screen.getAllByRole("button", { name: /избриши/i })[0]);

    await waitFor(() => expect(screen.queryByText("Собирање гости")).not.toBeInTheDocument());
  });

  it("edits an item's title and saves via PATCH", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "a1", event_id: "e1", time: "16:00", title: "Изменето", location: null, notes: null, sort_order: 0 }),
    });
    render(<AgendaClient initialItems={items} coupleNames="Ана и Марко" eventDate="2026-10-18" />);

    fireEvent.click(screen.getAllByRole("button", { name: /^измени$/i })[0]);

    const titleInput = screen.getByLabelText("Измени наслов");
    fireEvent.change(titleInput, { target: { value: "Изменето" } });
    fireEvent.click(screen.getByRole("button", { name: /^зачувај$/i }));

    await waitFor(() => expect(screen.getByText("Изменето")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/agenda/a1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ time: "16:00", title: "Изменето", location: null, notes: null }),
      })
    );
  });

  it("shows the couple names, date and each item's time in the invitation card", () => {
    render(<AgendaClient initialItems={items} coupleNames="Ана и Марко" eventDate="2026-10-18" />);
    expect(screen.getByRole("heading", { name: "Агенда" })).toBeInTheDocument();
    expect(screen.getByText("Ана и Марко · 18 октомври 2026")).toBeInTheDocument();
    expect(screen.getByText("16:00")).toBeInTheDocument();
    expect(screen.getByText("17:00")).toBeInTheDocument();
  });

  it("shows an empty message when there's nothing planned yet", () => {
    render(<AgendaClient initialItems={[]} coupleNames="Ана и Марко" eventDate="2026-10-18" />);
    expect(screen.getByText("Сè уште нема испланирано ништо.")).toBeInTheDocument();
  });
});
