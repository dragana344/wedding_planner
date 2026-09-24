import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuestsClient } from "@/components/couple/GuestsClient";

const guests = [
  { id: "g1", event_id: "e1", full_name: "Ана Петровска", phone: "070111222", party_size: 2, rsvp_status: "pending" as const, notes: null, side: null },
];
const stats = { total: 1, confirmed: 0, declined: 0, pending: 1, invited: 0, totalAttending: 0 };

describe("GuestsClient", () => {
  it("renders stats and the guest list, and adds a guest (non-wedding: flat list, no side field)", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "g2", event_id: "e1", full_name: "Марко С.", phone: null, party_size: 1, rsvp_status: "pending", notes: null, side: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ guests: [...guests, { id: "g2", event_id: "e1", full_name: "Марко С.", phone: null, party_size: 1, rsvp_status: "pending", notes: null, side: null }], stats: { total: 2, confirmed: 0, declined: 0, pending: 2, invited: 0, totalAttending: 0 } }),
      });
    render(<GuestsClient initialGuests={guests} initialStats={stats} eventType="birthday" />);

    expect(screen.getByText("Ана Петровска")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument(); // total stat tile
    expect(screen.queryByText("Bride's side")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Side")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Марко С." } });
    fireEvent.click(screen.getByRole("button", { name: /add guest/i }));

    await waitFor(() => expect(screen.getByText("Марко С.")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/couple/guests",
      expect.objectContaining({ body: expect.stringContaining('"side":null') })
    );
  });

  it("changes a guest's RSVP status", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...guests[0], rsvp_status: "confirmed" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ guests: [{ ...guests[0], rsvp_status: "confirmed" }], stats: { total: 1, confirmed: 1, declined: 0, pending: 0, invited: 0, totalAttending: 1 } }),
      });
    render(<GuestsClient initialGuests={guests} initialStats={stats} eventType="birthday" />);

    fireEvent.change(screen.getByLabelText(/status for ана петровска/i), { target: { value: "confirmed" } });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/guests/g1",
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });

  it("splits guests into Bride's side / Groom's side columns for a wedding event, and lets a guest be moved", async () => {
    const weddingGuests = [
      { id: "g1", event_id: "e1", full_name: "Ана Петровска", phone: null, party_size: 1, rsvp_status: "pending" as const, notes: null, side: "bride" as const },
      { id: "g2", event_id: "e1", full_name: "Марко С.", phone: null, party_size: 1, rsvp_status: "pending" as const, notes: null, side: "groom" as const },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...weddingGuests[0], side: "groom" }),
    });
    render(<GuestsClient initialGuests={weddingGuests} initialStats={stats} eventType="wedding" />);

    expect(screen.getByRole("heading", { name: "Bride's side" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Groom's side" })).toBeInTheDocument();
    expect(screen.getByLabelText("Side")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /move ана петровска to the other side/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/guests/g1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ type: "side", side: "groom" }),
        })
      )
    );
  });
});
