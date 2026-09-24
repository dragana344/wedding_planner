import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgendaClient } from "@/components/couple/AgendaClient";

const items = [
  { id: "a1", event_id: "e1", time: "16:00", title: "Собирање гости", notes: null, sort_order: 0 },
  { id: "a2", event_id: "e1", time: "17:00", title: "Церемонија", notes: null, sort_order: 1 },
];

describe("AgendaClient", () => {
  it("renders items and adds a new one", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "a3", event_id: "e1", time: "18:00", title: "Вечера", notes: null, sort_order: 2 }),
    });
    render(<AgendaClient initialItems={items} />);

    expect(screen.getByText("Собирање гости")).toBeInTheDocument();
    expect(screen.getByText("Церемонија")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "Вечера" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    await waitFor(() => expect(screen.getByText("Вечера")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/agenda",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("deletes an item", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<AgendaClient initialItems={items} />);

    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    await waitFor(() => expect(screen.queryByText("Собирање гости")).not.toBeInTheDocument());
  });

  it("edits an item's title and saves via PATCH", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "a1", event_id: "e1", time: "16:00", title: "Изменето", notes: null, sort_order: 0 }),
    });
    render(<AgendaClient initialItems={items} />);

    fireEvent.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

    const titleInput = screen.getByLabelText("Edit title");
    fireEvent.change(titleInput, { target: { value: "Изменето" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText("Изменето")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/agenda/a1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ time: "16:00", title: "Изменето", notes: null }),
      })
    );
  });
});
