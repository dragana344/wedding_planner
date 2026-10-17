import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// next/font is compiled by Next, not available under jsdom.
vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ className: "font" }),
}));

import { LocationsClient } from "@/components/couple/LocationsClient";

const locations = [
  { id: "l1", event_id: "e1", label: "Црква", address: "Ул. 1", map_url: null, sort_order: 0 },
];

describe("LocationsClient", () => {
  it("renders locations and adds a new one", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "l2", event_id: "e1", label: "Ресторан", address: null, map_url: null, sort_order: 1 }),
    });
    render(<LocationsClient initialLocations={locations} coupleNames="Ана и Марко" eventDate="2026-10-18" />);

    expect(screen.getByText("Црква")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Назив"), { target: { value: "Ресторан" } });
    fireEvent.click(screen.getByRole("button", { name: /додади/i }));

    await waitFor(() => expect(screen.getByText("Ресторан")).toBeInTheDocument());
  });

  it("deletes a location", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<LocationsClient initialLocations={locations} coupleNames="Ана и Марко" eventDate="2026-10-18" />);

    fireEvent.click(screen.getByRole("button", { name: /избриши/i }));

    await waitFor(() => expect(screen.queryByText("Црква")).not.toBeInTheDocument());
  });

  it("edits a location's label and saves via PATCH", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "l1", event_id: "e1", label: "Изменето", address: "Ул. 1", map_url: null, sort_order: 0 }),
    });
    render(<LocationsClient initialLocations={locations} coupleNames="Ана и Марко" eventDate="2026-10-18" />);

    fireEvent.click(screen.getByRole("button", { name: /^измени$/i }));

    const labelInput = screen.getByLabelText("Измени назив");
    fireEvent.change(labelInput, { target: { value: "Изменето" } });
    fireEvent.click(screen.getByRole("button", { name: /^зачувај$/i }));

    await waitFor(() => expect(screen.getByText("Изменето")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/locations/l1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ label: "Изменето", address: "Ул. 1", map_url: null }),
      })
    );
  });

  it("shows the couple names and date, and an empty message when there are no locations", () => {
    render(<LocationsClient initialLocations={[]} coupleNames="Ана и Марко" eventDate="2026-10-18" />);
    expect(screen.getByRole("heading", { name: "Локации" })).toBeInTheDocument();
    expect(screen.getByText("Ана и Марко · 18 октомври 2026")).toBeInTheDocument();
    expect(screen.getByText("Сè уште нема додадено локации.")).toBeInTheDocument();
  });
});
