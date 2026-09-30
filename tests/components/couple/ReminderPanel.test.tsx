import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ReminderPanel } from "@/components/couple/guests/ReminderPanel";
import type { Guest } from "@/lib/couple/guests";

const share = { slug: "abcDEF123", coupleNames: "Ана и Марко", eventDate: "2027-07-20", venueName: "Сала Лотос", eventType: "wedding", emailEnabled: true };
const reminder = { sendAt: "2027-07-05T08:00:00.000Z", status: "scheduled" as const, isDefault: true, sentAt: null, sentCount: 0 };

function guest(overrides: Partial<Guest>): Guest {
  return {
    id: "g", event_id: "e1", full_name: "Гостин", phone: "070 123 456", party_size: 1, rsvp_status: "confirmed", notes: null, side: null,
    invite_token: "tokXXXXXXXXXXXXXXXXXXXXX", email: null, children_count: 0, menu_choice: null, allergies: null, rsvp_comment: null,
    invitation_sent_at: null, invitation_channel: null, ...overrides,
  };
}

describe("ReminderPanel (A10)", () => {
  it("shows the default time in Skopje and saves a new one", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...reminder, sendAt: "2027-07-10T14:30:00.000Z", isDefault: false }) });
    render(<ReminderPanel initial={reminder} guests={[]} share={share} organizerSide={null} />);

    expect(screen.getByText(/15 дена пред настанот/)).toBeInTheDocument();
    const when = screen.getByLabelText("Кога да се прати потсетникот") as HTMLInputElement;
    expect(when.value).toBe("2027-07-05T10:00");

    fireEvent.change(when, { target: { value: "2027-07-10T16:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај потсетник" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/reminder",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ send_at: "2027-07-10T14:30:00.000Z", enabled: true }) }),
      ),
    );
    expect(await screen.findByText("Потсетникот е зачуван.")).toBeInTheDocument();
  });

  it("switches the reminder off", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...reminder, status: "cancelled", isDefault: false }) });
    render(<ReminderPanel initial={reminder} guests={[]} share={share} organizerSide={null} />);
    fireEvent.click(screen.getByLabelText("Прати потсетник по email"));
    fireEvent.click(screen.getByRole("button", { name: "Зачувај потсетник" }));
    await waitFor(() => expect(JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body).enabled).toBe(false));
  });

  it("reports a sent reminder and no longer offers to change it", () => {
    render(<ReminderPanel initial={{ ...reminder, status: "sent", sentAt: "2027-07-05T08:07:00.000Z", sentCount: 12 }} guests={[]} share={share} organizerSide={null} />);
    expect(screen.getByText(/Испратен .* до 12 гости/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зачувај потсетник" })).not.toBeInTheDocument();
  });

  it("lists yes/later guests without email for sending by hand, with the reminder text", () => {
    const guests = [
      guest({ id: "a", full_name: "Без Email", rsvp_status: "confirmed" }),
      guest({ id: "b", full_name: "Подоцна", rsvp_status: "later" }),
      guest({ id: "c", full_name: "Со Email", email: "x@example.mk" }),
      guest({ id: "d", full_name: "Одбил", rsvp_status: "declined" }),
    ];
    render(<ReminderPanel initial={reminder} guests={guests} share={share} organizerSide={null} />);
    const manual = screen.getByRole("list", { name: "Прати рачно" });
    expect(within(manual).getAllByRole("listitem").map((li) => li.querySelector("strong")!.textContent)).toEqual(["Без Email", "Подоцна"]);
    const wa = within(manual).getAllByRole("link", { name: "WhatsApp" })[0].getAttribute("href")!;
    expect(decodeURIComponent(wa)).toContain("Ве потсетуваме на свадбата на Ана и Марко");
  });

  it("lists everyone to remind by hand when email is off, and only a co-organizer's own side", () => {
    const guests = [
      guest({ id: "a", full_name: "Со Email Невеста", email: "x@example.mk", side: "bride" }),
      guest({ id: "b", full_name: "Младоженецов", side: "groom" }),
    ];
    render(<ReminderPanel initial={reminder} guests={guests} share={{ ...share, emailEnabled: false }} organizerSide="groom" />);
    expect(screen.getByText(/Праќањето email не е вклучено/)).toBeInTheDocument();
    const names = within(screen.getByRole("list", { name: "Прати рачно" })).getAllByRole("listitem").map((li) => li.querySelector("strong")!.textContent);
    expect(names).toEqual(["Младоженецов"]);
  });
});
