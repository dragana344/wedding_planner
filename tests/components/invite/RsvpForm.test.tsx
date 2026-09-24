import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RsvpForm } from "@/components/invite/RsvpForm";

describe("RsvpForm", () => {
  it("submits an attending RSVP with name and party size", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText(/your full name/i), { target: { value: "Mila Milova" } });
    fireEvent.click(screen.getByRole("button", { name: /yes, i'll be there/i }));
    fireEvent.change(screen.getByLabelText(/number of guests/i), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /send rsvp/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/invite/abc123/rsvp",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ full_name: "Mila Milova", attending: true, party_size: 3 }),
        })
      )
    );
    expect(await screen.findByText(/we've noted you'll be attending/i)).toBeInTheDocument();
  });

  it("submits a decline without showing the party size field", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText(/your full name/i), { target: { value: "Petar Petrovski" } });
    fireEvent.click(screen.getByRole("button", { name: /can't make it/i }));
    expect(screen.queryByLabelText(/number of guests/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /send rsvp/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/invite/abc123/rsvp",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ full_name: "Petar Petrovski", attending: false, party_size: 1 }),
        })
      )
    );
    expect(await screen.findByText(/thank you for letting us know/i)).toBeInTheDocument();
  });

  it("requires choosing attending before submitting", async () => {
    global.fetch = vi.fn();
    render(<RsvpForm slug="abc123" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText(/your full name/i), { target: { value: "Ana Petrovska" } });
    fireEvent.click(screen.getByRole("button", { name: /send rsvp/i }));

    expect(await screen.findByText(/let us know if you'll be attending/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the server error message when the request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Invitation not found." }) });
    render(<RsvpForm slug="bad-slug" accentColor="#C9992F" />);

    fireEvent.change(screen.getByLabelText(/your full name/i), { target: { value: "Someone" } });
    fireEvent.click(screen.getByRole("button", { name: /yes, i'll be there/i }));
    fireEvent.click(screen.getByRole("button", { name: /send rsvp/i }));

    expect(await screen.findByText("Invitation not found.")).toBeInTheDocument();
  });
});
