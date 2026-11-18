import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// next/font is compiled by Next, not available under jsdom.
vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ className: "font" }),
}));

import { AgendaClient } from "@/components/couple/AgendaClient";

const venue = { name: "Ресторан Панорама", address: "Водно бб, Скопје", rooms: ["Голема сала"] };
const base = { event_id: "e1", address: null, map_url: null, notes: null };
const items = [
  { ...base, id: "a1", time: "16:00", title: "Собирање гости", location: null, sort_order: 0 },
  {
    ...base,
    id: "a2",
    time: "17:00",
    title: "Церемонија",
    location: "Црква Св. Климент Охридски",
    address: "Охрид 1",
    map_url: "https://maps.example/church",
    sort_order: 1,
  },
];

const renderAgenda = (initialItems = items) =>
  render(<AgendaClient initialItems={initialItems} coupleNames="Ана и Марко" eventDate="2026-10-18" venue={venue} />);

describe("AgendaClient", () => {
  it("renders items with their place, address and a map link", () => {
    renderAgenda();
    expect(screen.getByText("Собирање гости")).toBeInTheDocument();
    expect(screen.getByText("Церемонија")).toBeInTheDocument();
    expect(screen.getByText(/Црква Св\. Климент Охридски · Охрид 1/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Мапа" }).map((a) => a.getAttribute("href"))).toContain("https://maps.example/church");
  });

  it("adds an item held somewhere else, typing the place by hand", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...base, id: "a3", time: "18:00", title: "Вечера", location: "Дом", address: "Скопје", sort_order: 2 }),
    });
    renderAgenda();

    fireEvent.click(screen.getByRole("button", { name: "Додај точка" }));
    fireEvent.change(screen.getByLabelText("Наслов"), { target: { value: "Вечера" } });
    fireEvent.change(screen.getByLabelText("Каде (опционално)"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Назив на местото"), { target: { value: "Дом" } });
    fireEvent.change(screen.getByLabelText("Адреса"), { target: { value: "Скопје" } });
    fireEvent.click(screen.getByRole("button", { name: /додади/i }));

    await waitFor(() => expect(screen.getByText("Вечера")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/agenda",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ time: null, title: "Вечера", location: "Дом", address: "Скопје", map_url: null, notes: null }),
      }),
    );
  });

  it("fills in the restaurant's name, hall, address and map link when 'in the restaurant' is chosen", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...base, id: "a3", time: null, title: "Свечена вечера", location: "Ресторан Панорама – Голема сала", sort_order: 2 }),
    });
    renderAgenda();

    fireEvent.click(screen.getByRole("button", { name: "Додај точка" }));
    fireEvent.change(screen.getByLabelText("Наслов"), { target: { value: "Свечена вечера" } });
    fireEvent.change(screen.getByLabelText("Каде (опционално)"), { target: { value: "venue" } });
    // Nothing to type: the place is shown, not asked for.
    expect(screen.getByText(/Ресторан Панорама – Голема сала · Водно бб, Скопје/, { selector: ".agenda-place-auto" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Назив на местото")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /додади/i }));

    await waitFor(() => expect(screen.getByText("Свечена вечера")).toBeInTheDocument());
    const sent = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(sent).toMatchObject({ title: "Свечена вечера", location: "Ресторан Панорама – Голема сала", address: "Водно бб, Скопје" });
    expect(sent.map_url).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ресторан Панорама, Водно бб, Скопје"));
  });

  it("deletes an item", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    renderAgenda();

    fireEvent.click(screen.getAllByRole("button", { name: /избриши/i })[0]);

    await waitFor(() => expect(screen.queryByText("Собирање гости")).not.toBeInTheDocument());
  });

  it("edits an item's title and saves via PATCH, keeping its place", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...base, id: "a2", time: "17:00", title: "Изменето", location: "Црква Св. Климент Охридски", address: "Охрид 1", map_url: "https://maps.example/church", sort_order: 1 }),
    });
    renderAgenda();

    fireEvent.click(screen.getAllByRole("button", { name: /^измени$/i })[1]);
    // An existing place that isn't the restaurant opens as "another place", with its fields filled.
    expect(screen.getByLabelText("Назив на местото")).toHaveValue("Црква Св. Климент Охридски");
    fireEvent.change(screen.getByLabelText("Измени наслов"), { target: { value: "Изменето" } });
    fireEvent.click(screen.getByRole("button", { name: /^зачувај$/i }));

    await waitFor(() => expect(screen.getByText("Изменето")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/agenda/a2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          time: "17:00",
          title: "Изменето",
          location: "Црква Св. Климент Охридски",
          address: "Охрид 1",
          map_url: "https://maps.example/church",
          notes: null,
        }),
      }),
    );
  });

  it("clears the place when 'no place' is chosen while editing", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...base, id: "a2", time: "17:00", title: "Церемонија", location: null, sort_order: 1 }) });
    renderAgenda();

    fireEvent.click(screen.getAllByRole("button", { name: /^измени$/i })[1]);
    fireEvent.change(screen.getByLabelText("Каде (опционално)"), { target: { value: "none" } });
    fireEvent.click(screen.getByRole("button", { name: /^зачувај$/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toMatchObject({ location: null, address: null, map_url: null });
  });

  it("shows the couple names, date and each item's time in the invitation card", () => {
    renderAgenda();
    expect(screen.getByRole("heading", { name: "Агенда" })).toBeInTheDocument();
    expect(screen.getByText("Ана и Марко · 18 октомври 2026")).toBeInTheDocument();
    expect(screen.getByText("16:00")).toBeInTheDocument();
    expect(screen.getByText("17:00")).toBeInTheDocument();
  });

  it("shows an empty message when there's nothing planned yet", () => {
    renderAgenda([]);
    expect(screen.getByText("Сè уште нема испланирано ништо.")).toBeInTheDocument();
  });
});
