import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewEventForm } from "@/components/venue/NewEventForm";
import * as events from "@/lib/venue/events";
import * as credentials from "@/lib/venue/credentials";

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
    await userEvent.click(screen.getByLabelText("Garden"));
    await userEvent.selectOptions(screen.getByLabelText(/^мени$/i), "m1");
    await userEvent.type(screen.getByLabelText(/корисничко име/i), "ivana-petar");
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.type(screen.getByPlaceholderText(/е-пошта за контакт/i), "couple@example.com");
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
    });
    expect(credentialsSpy).toHaveBeenCalledWith("e1", "ivana-petar", "a-strong-password");
    expect(contactSpy).toHaveBeenCalledWith("e1", {
      contact_email: "couple@example.com",
      contact_email_2: null,
      contact_phone: null,
    });
    expect(financeSpy).toHaveBeenCalledWith("e1", {
      total_price: null,
      deposit_paid: null,
    });
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
    await userEvent.type(screen.getByLabelText(/^лозинка/i), "a-strong-password");
    await userEvent.click(screen.getByRole("button", { name: /креирај настан/i }));

    expect(deleteSpy).toHaveBeenCalledWith("e1");
    expect(await screen.findByText(/username taken/i)).toBeInTheDocument();
  });
});
