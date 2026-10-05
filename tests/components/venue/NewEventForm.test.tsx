import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewEventForm } from "@/components/venue/NewEventForm";
import * as events from "@/lib/venue/events";
import * as credentials from "@/lib/venue/credentials";

// The fixed test date has passed, and the hall check would hit the network:
// answer "yes" to the form's questions and report no other event that day.
let confirmSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(events, "findSameDayRoomEvents").mockResolvedValue([]);
});

describe("NewEventForm", () => {
  it("creates the event and sets the couple's login credentials + contact info on submit", async () => {
    const createSpy = vi.spyOn(events, "createEvent").mockResolvedValue({ id: "e1" });
    const contactSpy = vi.spyOn(events, "updateEventContactInfo").mockResolvedValue();
    const financeSpy = vi.spyOn(events, "updateEventFinance").mockResolvedValue();
    const credentialsSpy = vi.spyOn(credentials, "createEventCredentials").mockResolvedValue();
    const onCreated = vi.fn();

    render(
      <NewEventForm
        venueId="v1"
        rooms={[{ id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 }]}
        menuTemplates={[{ id: "m1", venue_id: "v1", name: "Standard Menu", description: null }]}
        onCreated={onCreated}
      />
    );

    await userEvent.type(screen.getByLabelText(/имиња на славениците/i), "Ivana & Petar");
    await userEvent.type(screen.getByLabelText(/^датум/i), "2026-10-01");
    await userEvent.selectOptions(screen.getByLabelText(/вид на настан/i), "birthday");
    await userEvent.type(screen.getByLabelText(/^почеток/i), "18:00");
    await userEvent.selectOptions(screen.getByLabelText(/^статус/i), "confirmed");
    await userEvent.type(screen.getByLabelText(/број на гости/i), "80");
    await userEvent.type(screen.getByLabelText(/^крај/i), "22:00");
    // One room: already picked, no room step.
    expect(screen.getByLabelText("Garden")).toBeChecked();
    await userEvent.selectOptions(screen.getByLabelText(/^мени$/i), "m1");
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "ivana-petar");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
    await userEvent.type(screen.getByLabelText("Телефон на парот"), "070 123 456");
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    expect(createSpy).toHaveBeenCalledWith({
      venue_id: "v1",
      couple_names: "Ivana & Petar",
      event_date: "2026-10-01",
      start_time: "18:00",
      end_time: "22:00",
      event_type: "birthday",
      status: "confirmed",
      guest_count_estimate: 80,
      room_ids: ["r1"],
      menu_template_id: "m1",
      contacts: { contact_email: "couple@example.com", contact_email_2: null, contact_phone: "070 123 456" },
    });
    expect(credentialsSpy).toHaveBeenCalledWith("e1", "ivana-petar", "a-strong-password");
    // A21: saved with the event itself, not as a second step.
    expect(contactSpy).not.toHaveBeenCalled();
    expect(financeSpy).toHaveBeenCalledWith("e1", {
      total_price: null,
      deposit_paid: null,
    });
    // The couple's login is shown once before the form hands back.
    expect(onCreated).not.toHaveBeenCalled();
    expect(await screen.findByText("Настанот е креиран")).toBeInTheDocument();
    expect(screen.getByText(/Корисничко име: ivana-petar/)).toBeInTheDocument();
    expect(screen.getByText(/Лозинка: a-strong-password/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Кон настаните" }));
    expect(onCreated).toHaveBeenCalled();
  });

  it("fills the password field with a random value when Generate is clicked", async () => {
    render(<NewEventForm venueId="v1" rooms={[]} menuTemplates={[]} onCreated={vi.fn()} />);
    const passwordInput = screen.getByLabelText(/^лозинка/i) as HTMLInputElement;
    expect(passwordInput.value).toBe("");
    await userEvent.click(screen.getByRole("button", { name: /генерирај/i }));
    expect(passwordInput.value.length).toBeGreaterThan(0);
  });

  it("deletes the event if setting up credentials fails, so the user can retry", async () => {
    vi.spyOn(events, "createEvent").mockResolvedValue({ id: "e1" });
    vi.spyOn(credentials, "createEventCredentials").mockRejectedValue(new Error("username taken"));
    const deleteSpy = vi.spyOn(events, "deleteEvent").mockResolvedValue();

    render(<NewEventForm venueId="v1" rooms={[]} menuTemplates={[]} onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/имиња на славениците/i), "Ivana & Petar");
    await userEvent.type(screen.getByLabelText(/^датум/i), "2026-10-01");
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "taken-username");
    await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
    await userEvent.type(screen.getByLabelText("Телефон на парот"), "070 123 456");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    expect(deleteSpy).toHaveBeenCalledWith("e1");
    expect(await screen.findByText(/username taken/i)).toBeInTheDocument();
  });

  it("does not create an event without the couple's email and phone (A21)", async () => {
    const createSpy = vi.spyOn(events, "createEvent").mockClear().mockResolvedValue({ id: "e1" });
    render(<NewEventForm venueId="v1" rooms={[]} menuTemplates={[]} onCreated={vi.fn()} />);
    expect(screen.getByLabelText("Email на парот")).toBeRequired();
    expect(screen.getByLabelText("Телефон на парот")).toBeRequired();

    await userEvent.type(screen.getByLabelText(/имиња на славениците/i), "Ivana & Petar");
    await userEvent.type(screen.getByLabelText(/^датум/i), "2026-10-01");
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "ivana-petar");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.type(screen.getByLabelText("Email на парот"), "couple@example.com");
    fireEvent.submit(screen.getByRole("button", { name: /креирај настан/i }).closest("form")!);

    expect(await screen.findByText("Внесете телефон на парот.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  describe("room first (B6)", () => {
    const rooms = [
      { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 3600, height_cm: 2100 },
      { id: "r2", venue_id: "v1", name: "Мала сала", width_cm: 1500, height_cm: 1000 },
    ];
    const totals = { r1: { tables: 41, seats: 404 }, r2: { tables: 8, seats: 80 } };

    it("starts with picking the hall when the venue has several", async () => {
      render(<NewEventForm venueId="v1" rooms={rooms} roomTotals={totals} menuTemplates={[]} onCreated={() => {}} />);
      expect(screen.getByRole("heading", { name: "Во која сала?" })).toBeInTheDocument();
      expect(screen.queryByLabelText(/имиња на славениците/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Голема сала/ })).toHaveTextContent("41 маси · 404 места");
      const next = screen.getByRole("button", { name: "Продолжи" });
      expect(next).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: /Мала сала/ }));
      expect(screen.getByRole("button", { name: /Мала сала/ })).toHaveAttribute("aria-pressed", "true");
      await userEvent.click(next);

      expect(screen.getByLabelText(/имиња на славениците/i)).toBeInTheDocument();
      expect(screen.getByLabelText("Мала сала")).toBeChecked();
      expect(screen.getByLabelText("Голема сала")).not.toBeChecked();
      await userEvent.click(screen.getByRole("button", { name: "Смени сала" }));
      expect(screen.getByRole("heading", { name: "Во која сала?" })).toBeInTheDocument();
    });

    it("an event can use both halls", async () => {
      render(<NewEventForm venueId="v1" rooms={rooms} menuTemplates={[]} onCreated={() => {}} />);
      await userEvent.click(screen.getByRole("button", { name: /Голема сала/ }));
      await userEvent.click(screen.getByRole("button", { name: /Мала сала/ }));
      await userEvent.click(screen.getByRole("button", { name: "Продолжи" }));
      expect(screen.getByLabelText("Мала сала")).toBeChecked();
      expect(screen.getByLabelText("Голема сала")).toBeChecked();
    });

    it("skips the step when a hall was already chosen (?room=)", () => {
      render(<NewEventForm venueId="v1" rooms={rooms} initialRoomIds={["r2"]} menuTemplates={[]} onCreated={() => {}} />);
      expect(screen.queryByRole("heading", { name: "Во која сала?" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Мала сала")).toBeChecked();
    });
  });
});

describe("NewEventForm — questions before saving", () => {
  async function fill(date: string) {
    await userEvent.type(screen.getByLabelText(/имиња на славениците/i), "Ана и Марко");
    await userEvent.type(screen.getByLabelText(/^датум/i), date);
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "ana-marko");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.type(screen.getByLabelText(/email на парот/i), "couple@example.com");
    await userEvent.type(screen.getByLabelText(/телефон на парот/i), "070 123 456");
  }
  const room = { id: "r1", venue_id: "v1", name: "Garden", width_cm: 1000, height_cm: 800 };

  it("does not create an event on a past date when the question is declined", async () => {
    const createSpy = vi.spyOn(events, "createEvent").mockClear().mockResolvedValue({ id: "e1" });
    confirmSpy.mockReturnValue(false);
    render(<NewEventForm venueId="v1" rooms={[room]} menuTemplates={[]} onCreated={vi.fn()} />);
    await fill("2000-02-20");
    fireEvent.click(screen.getByRole("button", { name: /креирај настан/i }));
    expect(confirmSpy).toHaveBeenCalledWith("Датумот 20 февруари 2000 е во минатото. Да се креира настанот сепак?");
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("names the event already booked in the hall that day", async () => {
    const createSpy = vi.spyOn(events, "createEvent").mockClear().mockResolvedValue({ id: "e1" });
    vi.spyOn(events, "findSameDayRoomEvents").mockResolvedValue([{ id: "e0", couple_names: "Ива и Дејан", start_time: "18:00:00", end_time: "23:00:00" }]);
    confirmSpy.mockImplementation((message?: string) => !String(message).includes("веќе има настан"));
    render(<NewEventForm venueId="v1" rooms={[room]} menuTemplates={[]} onCreated={vi.fn()} />);
    await fill("2099-06-12");
    fireEvent.click(screen.getByRole("button", { name: /креирај настан/i }));
    await vi.waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("• Ива и Дејан (18:00 – 23:00)")));
    expect(createSpy).not.toHaveBeenCalled();
  });
});
