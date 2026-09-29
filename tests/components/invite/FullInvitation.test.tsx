import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// next/font is compiled by Next, not available under jsdom.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "font", style: { fontFamily: "serif" } });
  return {
    Great_Vibes: font, Cormorant_Garamond: font, Marck_Script: font, Playfair_Display: font,
    EB_Garamond: font, Manrope: font, Amatic_SC: font, Caveat: font,
  };
});
import { FullInvitation } from "@/components/invite/FullInvitation";

const invitation = {
  couple_names: "Ана и Марко",
  event_date: "2027-06-12",
  start_time: "18:00:00",
  venue_name: "Сала Лотос",
  room_names: [],
  template_id: "elegant-gold",
  message: null,
  photo_path: null,
};

const invitee = {
  fullName: "Петар Петровски",
  rsvpStatus: "invited",
  partySize: 2,
  childrenCount: 0,
  menuChoice: null,
  allergies: null,
  rsvpComment: null,
};

describe("FullInvitation", () => {
  it("addresses the guest by name on a personal link (A1)", () => {
    render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} invitee={invitee} guestToken={"T".repeat(24)} />);
    expect(screen.getByRole("heading", { name: /Петар Петровски/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Име и презиме")).not.toBeInTheDocument();
  });

  it("stays the generic invitation without a guest", () => {
    render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} />);
    expect(screen.queryByText(/Петар Петровски/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Име и презиме")).toBeInTheDocument();
  });
});
