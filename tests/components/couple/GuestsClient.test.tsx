import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { GuestsClient } from "@/components/couple/GuestsClient";
import type { Guest, GuestStats } from "@/lib/couple/guests";

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    event_id: "e1",
    full_name: "Ана Петровска",
    phone: "070111222",
    party_size: 2,
    rsvp_status: "pending",
    notes: null,
    side: null,
    invite_token: "tok-g1-xxxxxxxxxxxxxxxxxx",
    email: null,
    children_count: 0,
    menu_choice: null,
    allergies: null,
    rsvp_comment: null,
    invitation_sent_at: null,
    invitation_channel: null,
    ...overrides,
  };
}

function makeStats(overrides: Partial<GuestStats> = {}): GuestStats {
  return {
    total: 1,
    confirmed: 0,
    declined: 0,
    pending: 1,
    invited: 0,
    later: 0,
    totalAttending: 0,
    childrenAttending: 0,
    menu: { standard: 0, posno: 0, vegetarian: 0, unset: 0 },
    invitationsSent: 0,
    ...overrides,
  };
}

const guests = [makeGuest()];
const stats = makeStats();

describe("GuestsClient", () => {
  it("renders stats and the guest list, and adds a guest (non-wedding: flat list, no side field)", async () => {
    const added = makeGuest({ id: "g2", full_name: "Марко С.", party_size: 1 });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => added })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ guests: [...guests, added], stats: makeStats({ total: 2, pending: 2 }) }) });
    render(<GuestsClient initialGuests={guests} initialStats={stats} eventType="birthday" />);

    expect(screen.getByText("Ана Петровска")).toBeInTheDocument();
    expect(screen.getByText("Вкупно")).toBeInTheDocument(); // total stat tile
    expect(screen.queryByText("Страна на невестата")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Страна")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Марко С." } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "marko@example.mk" } });
    fireEvent.click(screen.getByRole("button", { name: /додади гостин/i }));

    await waitFor(() => expect(screen.getByText("Марко С.")).toBeInTheDocument());
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ full_name: "Марко С.", email: "marko@example.mk", side: null });
  });

  it("changes a guest's RSVP status", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...guests[0], rsvp_status: "confirmed" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ guests: [{ ...guests[0], rsvp_status: "confirmed" }], stats: makeStats({ confirmed: 1, pending: 0 }) }) });
    render(<GuestsClient initialGuests={guests} initialStats={stats} eventType="birthday" />);

    fireEvent.change(screen.getByLabelText(/статус за ана петровска/i), { target: { value: "confirmed" } });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/couple/guests/g1", expect.objectContaining({ method: "PATCH" })));
  });

  it("splits guests into Bride's side / Groom's side columns for a wedding event, and lets a guest be moved", async () => {
    const weddingGuests = [makeGuest({ side: "bride" }), makeGuest({ id: "g2", full_name: "Марко С.", side: "groom" })];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...weddingGuests[0], side: "groom" }) });
    render(<GuestsClient initialGuests={weddingGuests} initialStats={stats} eventType="wedding" />);

    expect(screen.getByRole("heading", { name: "Страна на невестата" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Страна на младоженецот" })).toBeInTheDocument();
    expect(screen.getByLabelText("Страна")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /премести ана петровска на другата страна/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/couple/guests/g1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ type: "side", side: "groom" }) }),
      ),
    );
  });
});

describe("GuestsClient RSVP changes via the invitation link (SEC-021)", () => {
  it("shows when the link last changed a guest's answer and what it was before", () => {
    render(
      <GuestsClient
        initialGuests={[makeGuest({ rsvp_status: "declined", rsvp_changed_via_link_at: "2026-10-03T10:15:00Z", rsvp_previous_status: "confirmed" })]}
        initialStats={makeStats({ declined: 1, pending: 0 })}
        eventType="birthday"
      />,
    );
    expect(screen.getByText(/Одговор преку поканата: .*\(претходно: Потврден\)/)).toBeInTheDocument();
  });

  it("offers and counts the 'answer later' status (A2)", () => {
    render(<GuestsClient initialGuests={[makeGuest({ rsvp_status: "later" })]} initialStats={makeStats({ pending: 0, later: 1 })} eventType="birthday" />);
    const select = screen.getByLabelText(/статус за ана петровска/i);
    expect(within(select).getByRole("option", { name: "Ќе одговори подоцна" })).toBeInTheDocument();
    expect(select).toHaveValue("later");
    expect(screen.getByText("Подоцна")).toBeInTheDocument();
  });
});

describe("GuestsClient final list (A7, A8, A17)", () => {
  const list = [
    makeGuest({ id: "g1", full_name: "Ана Петровска", rsvp_status: "confirmed", menu_choice: "posno", invitation_sent_at: "2027-01-01T10:00:00Z", invitation_channel: "viber" }),
    makeGuest({ id: "g2", full_name: "Марко Стојанов", phone: "071999888", rsvp_status: "declined" }),
    makeGuest({ id: "g3", full_name: "Јана Илиева", rsvp_status: "later", invitation_sent_at: "2027-01-01T10:00:00Z", invitation_channel: "link" }),
  ];
  const listStats = makeStats({ total: 3, confirmed: 1, declined: 1, later: 1, pending: 0, invitationsSent: 2 });

  function names() {
    return screen.queryAllByRole("button", { name: /^Детали за / }).map((b) => b.textContent);
  }

  it("searches by name or phone", () => {
    render(<GuestsClient initialGuests={list} initialStats={listStats} eventType="birthday" />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Пребарај гости" }), { target: { value: "марко" } });
    expect(names()).toEqual(["Марко Стојанов"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Пребарај гости" }), { target: { value: "999" } });
    expect(names()).toEqual(["Марко Стојанов"]);
  });

  it("filters by status, menu and whether the invitation went out", () => {
    render(<GuestsClient initialGuests={list} initialStats={listStats} eventType="birthday" />);
    fireEvent.change(screen.getByLabelText("Филтер по статус"), { target: { value: "later" } });
    expect(names()).toEqual(["Јана Илиева"]);
    fireEvent.change(screen.getByLabelText("Филтер по статус"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Филтер по мени"), { target: { value: "posno" } });
    expect(names()).toEqual(["Ана Петровска"]);
    fireEvent.change(screen.getByLabelText("Филтер по мени"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Филтер по покана"), { target: { value: "unsent" } });
    expect(names()).toEqual(["Марко Стојанов"]);
  });

  it("marks guests whose invitation has not been sent", () => {
    render(<GuestsClient initialGuests={list} initialStats={listStats} eventType="birthday" />);
    const unsent = screen.getByRole("button", { name: "Детали за Марко Стојанов" }).closest("[data-unsent]");
    expect(unsent).toHaveAttribute("data-unsent", "true");
    expect(within(unsent as HTMLElement).getByText("Неиспратена покана")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Детали за Ана Петровска" }).closest("[data-unsent]")).toHaveAttribute("data-unsent", "false");
    expect(screen.getByText("2 / 3")).toBeInTheDocument(); // invitations sent tile
  });

  it("shows the RSVP split as a labelled bar with percentages", () => {
    render(<GuestsClient initialGuests={list} initialStats={listStats} eventType="birthday" />);
    const chart = screen.getByRole("img", { name: /Одговори:/ });
    expect(chart).toHaveAccessibleName("Одговори: Потврдени 33%, Подоцна 33%, Без одговор 0%, Одбиени 33%");
    expect(screen.getByText("Потврдени · 1 (33%)")).toBeInTheDocument();
  });

  it("opens everything about a guest, including their table when seated", async () => {
    const detailed = makeGuest({
      id: "g9",
      full_name: "Петар Петровски",
      rsvp_status: "confirmed",
      party_size: 3,
      children_count: 1,
      menu_choice: "vegetarian",
      allergies: "ореви",
      rsvp_comment: "Честито!",
      email: "petar@example.mk",
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ seat: { table_label: "5", seat_number: 3, room_name: "Сала Лотос" } }) });
    render(<GuestsClient initialGuests={[detailed]} initialStats={makeStats({ confirmed: 1, pending: 0 })} eventType="birthday" />);

    fireEvent.click(screen.getByRole("button", { name: "Детали за Петар Петровски" }));
    const dialog = screen.getByRole("dialog", { name: "Петар Петровски" });
    for (const text of ["3 (од кои 1 деца)", "Вегетаријанско", "ореви", "Честито!", "petar@example.mk", "Не е испратена"]) {
      expect(within(dialog).getByText(text)).toBeInTheDocument();
    }
    expect(await within(dialog).findByText("Маса 5 · столче 3 · Сала Лотос")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/couple/guests/g9/seat");

    fireEvent.click(within(dialog).getByRole("button", { name: "Затвори" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says when a guest has no table yet", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ seat: null }) });
    render(<GuestsClient initialGuests={guests} initialStats={stats} eventType="birthday" />);
    fireEvent.click(screen.getByRole("button", { name: "Детали за Ана Петровска" }));
    expect(await screen.findByText("Сè уште нема маса")).toBeInTheDocument();
  });
});

describe("GuestsClient CSV (A20)", () => {
  it("links the export download", () => {
    render(<GuestsClient initialGuests={guests} initialStats={stats} eventType="birthday" />);
    expect(screen.getByRole("link", { name: "Извези CSV" })).toHaveAttribute("href", "/api/couple/guests/export");
  });

  it("uploads a CSV, then reloads the list and says how many were added", async () => {
    const imported = makeGuest({ id: "g5", full_name: "Увезен Гостин" });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imported: 1, skipped: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ guests: [...guests, imported], stats: makeStats({ total: 2 }) }) });
    render(<GuestsClient initialGuests={guests} initialStats={stats} eventType="birthday" />);

    const file = new File(["Име и презиме\nУвезен Гостин\nАна Петровска\n"], "gosti.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Увези CSV"), { target: { files: [file] } });

    expect(await screen.findByText("Увезен Гостин")).toBeInTheDocument();
    expect(screen.getByText("Додадени: 1. Прескокнати (веќе на листата): 1.")).toBeInTheDocument();
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/couple/guests/import");
    expect(JSON.parse(init.body)).toEqual({ csv: "Име и презиме\nУвезен Гостин\nАна Петровска\n" });
  });
});
