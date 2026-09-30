import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
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
import { SEAT_LOOKUP_ANCHOR } from "@/lib/seating/qr";

const invitation = {
  couple_names: "Ана и Марко",
  event_date: "2027-06-12",
  start_time: "18:00:00",
  venue_name: "Сала Лотос",
  room_names: [],
  template_id: "elegant-gold",
  message: null,
  photo_path: null,
  event_type: "wedding",
  agenda: [],
  locations: [],
  menu: [],
};

const withProgramme = {
  ...invitation,
  agenda: [
    { time: "16:00", title: "Собирање на гостите" },
    { time: "18:00", title: "Венчавка" },
  ],
  locations: [
    { label: "Црква Св. Никола", address: "Радовиш", map_url: "https://maps.app.goo.gl/abc" },
    { label: "Матично", address: null, map_url: "javascript:alert(1)" },
  ],
  menu: [
    { course: "starter" as const, name: "Мезе" },
    { course: "main" as const, name: "Печено пиле" },
    { course: "main" as const, name: "Сарма" },
  ],
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

  it("shows the day's programme in order, with times (A14)", () => {
    render(<FullInvitation slug="abc123" invitation={withProgramme} photoUrl={null} />);
    const programme = screen.getByRole("list", { name: "Програма" });
    expect(within(programme).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["16:00Собирање на гостите", "18:00Венчавка"]);
  });

  it("links each location to a map, never through an unsafe link (A14)", () => {
    render(<FullInvitation slug="abc123" invitation={withProgramme} photoUrl={null} />);
    const church = screen.getByRole("link", { name: /Црква Св. Никола/ });
    expect(church).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
    expect(church).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText("Матично").closest("a")).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("lists the menu by course (A14)", () => {
    render(<FullInvitation slug="abc123" invitation={withProgramme} photoUrl={null} />);
    const menu = screen.getByRole("region", { name: "Мени" });
    expect(within(menu).getByRole("heading", { name: "Главно јадење" })).toBeInTheDocument();
    expect(within(menu).getByText("Сарма")).toBeInTheDocument();
  });

  it("leaves out empty sections", () => {
    render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} />);
    expect(screen.queryByRole("list", { name: "Програма" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Мени" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Локации" })).not.toBeInTheDocument();
  });

  it("speaks Macedonian in every template", () => {
    for (const template_id of ["romantic-floral", "elegant-gold", "classic-minimal", "modern-watercolor", "rustic", "royal-green"]) {
      const { unmount } = render(<FullInvitation slug="abc123" invitation={{ ...invitation, template_id }} photoUrl={null} />);
      expect(document.body.textContent, template_id).not.toMatch(/You're invited|RSVP/);
      unmount();
    }
  });

  it("gives a personal page its sections and the guest's table (A15)", () => {
    render(
      <FullInvitation
        slug="abc123"
        invitation={withProgramme}
        photoUrl={null}
        invitee={invitee}
        guestToken={"T".repeat(24)}
        mySeat={{ found: true, seat: { table_label: "Маса 5", seat_number: 3, room_name: "Сала Лотос" } }}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Делови од поканата" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Покана", "Мојата маса", "Програма", "Локации", "Потврда"]);
    const table = screen.getByRole("region", { name: "Мојата маса" });
    expect(table).toHaveTextContent("Маса 5");
    expect(table).toHaveTextContent("столче 3");
    expect(table).toHaveTextContent("Сала Лотос");
    expect(screen.queryByRole("region", { name: "Каде седам?" })).not.toBeInTheDocument();
  });

  it("tells a personal-link guest when seating is not ready yet", () => {
    render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} invitee={invitee} guestToken={"T".repeat(24)} mySeat={{ found: true, seat: null }} />);
    expect(screen.getByRole("region", { name: "Мојата маса" })).toHaveTextContent("Распоредот на маси уште не е готов");
  });

  it("offers 'Каде седам?' on the shared link and shows only the table (A16)", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ seat: { table_label: "Маса 12", seat_number: null, room_name: "Сала Лотос" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ seat: null }) });
    render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} />);
    const finder = screen.getByRole("region", { name: "Каде седам?" });
    // Table QR cards (Session 3, lib/seating/qr.ts) open the invitation at this anchor.
    expect(finder).toHaveAttribute("id", SEAT_LOOKUP_ANCHOR);

    fireEvent.change(within(finder).getByLabelText("Вашето име (како на поканата)"), { target: { value: "Петар Петровски" } });
    fireEvent.click(within(finder).getByRole("button", { name: "Најди ја мојата маса" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/invite/abc123/seat", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Петар Петровски" }) })),
    );
    expect(await within(finder).findByText(/Маса 12/)).toBeInTheDocument();

    fireEvent.change(within(finder).getByLabelText("Вашето име (како на поканата)"), { target: { value: "Некој" } });
    fireEvent.click(within(finder).getByRole("button", { name: "Најди ја мојата маса" }));
    expect(await within(finder).findByText(/Не најдовме маса за тоа име/)).toBeInTheDocument();
  });

  it("says tomorrow and today above the countdown, and nothing extra before (A19)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2027-05-13T10:00:00Z"));
      const { unmount } = render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} />);
      await screen.findByText("Со чест Ве покануваме");
      expect(screen.queryByText(/е денот!/)).not.toBeInTheDocument(); // the timer already counts the days
      unmount();
      vi.setSystemTime(new Date("2027-06-11T10:00:00Z"));
      const second = render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} />);
      expect(await screen.findByText("УТРЕ е денот!")).toBeInTheDocument();
      second.unmount();
      vi.setSystemTime(new Date("2027-06-12T10:00:00Z"));
      render(<FullInvitation slug="abc123" invitation={invitation} photoUrl={null} />);
      expect(await screen.findByText("ДЕНЕС е денот!")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
