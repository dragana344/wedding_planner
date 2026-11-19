import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AnswersInbox } from "@/components/couple/guests/AnswersInbox";
import { CoupleAnswerForm, AnswerHistory } from "@/components/couple/guests/GuestAnswers";
import { GuestsClient } from "@/components/couple/GuestsClient";
import type { Guest, GuestStats } from "@/lib/couple/guests";
import type { InboxAnswer } from "@/lib/couple/rsvp-answer-view";

// Group B task 1 (0179): the couple's "Одговори" inbox, "Да се провери",
// typing in a phone answer and the answer history.

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "g1", event_id: "e1", full_name: "Ана Петровска", phone: null, party_size: 2, rsvp_status: "invited", notes: null, side: null,
    invite_token: "tok-g1-xxxxxxxxxxxxxxxxxx", email: null, children_count: 0, menu_counts: {}, allergies: null, rsvp_comment: null,
    invitation_sent_at: null, invitation_channel: null, ...overrides,
  };
}

function makeAnswer(overrides: Partial<InboxAnswer> = {}): InboxAnswer {
  return {
    id: "a1", createdAt: "2027-05-01T10:00:00Z", source: "shared", fullName: "Ana Petrovska", phone: null, status: "confirmed", partySize: 4,
    childrenCount: 0, menuCounts: {}, allergies: null, comment: null, householdNames: [], match: "review", reviewState: "pending",
    guestId: null, guestName: null, invitedPartySize: null, before: null, after: null, suggestions: [], ...overrides,
  };
}

const stats: GuestStats = {
  total: 2, confirmed: 0, declined: 0, pending: 0, invited: 2, later: 0, totalAttending: 0, childrenAttending: 0, noMeal: 0, menuRechoose: 0, menus: [], notDone: [],
  invitationsSent: 0, allergyNotes: [],
};

const guests = [makeGuest(), makeGuest({ id: "g2", full_name: "Марко Илиевски" })];

function respond(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const b of bodies) fn.mockResolvedValueOnce({ ok: true, json: async () => b });
  global.fetch = fn;
  return fn;
}

describe("AnswersInbox", () => {
  it("0180: explains an answer that waits because the guest limit was reached", async () => {
    respond({ answers: [makeAnswer({ reviewReason: "guest_limit" })], pending: 1 });
    render(<AnswersInbox guests={guests} menus={[]} onGuestChanged={vi.fn()} onPendingChange={vi.fn()} />);
    expect(await screen.findByText("Лимитот на гости е достигнат — гостинот не можеше да се додаде.")).toBeInTheDocument();
  });

  it("shows 'Да се провери' on top with the likely guest first, and applies the answer to the chosen guest", async () => {
    const pending = makeAnswer({ suggestions: [{ id: "g1", fullName: "Ана Петровска" }] });
    const applied = makeAnswer({
      id: "a0", fullName: "Марко Илиевски", match: "exact", reviewState: "none", guestId: "g2", guestName: "Марко Илиевски", partySize: 4, invitedPartySize: 2,
      before: { status: "confirmed", party_size: 2, children_count: 0, menu_counts: {}, allergies: null, household_names: [] },
      after: { status: "confirmed", party_size: 4, children_count: 0, menu_counts: {}, allergies: null, household_names: [] },
    });
    const updated = makeGuest({ rsvp_status: "confirmed", party_size: 4 });
    const fetchMock = respond(
      { answers: [pending, applied], pending: 1 },
      { ok: true, guest: updated },
      { answers: [{ ...pending, reviewState: "applied", guestId: "g1", guestName: "Ана Петровска" }, applied], pending: 0 },
    );
    const onGuestChanged = vi.fn();
    const onPendingChange = vi.fn();
    render(<AnswersInbox guests={guests} menus={[]} onGuestChanged={onGuestChanged} onPendingChange={onPendingChange} />);

    expect(await screen.findByRole("heading", { name: "Да се провери (1)" })).toBeInTheDocument();
    expect(onPendingChange).toHaveBeenCalledWith(1);
    // The applied answer shows what it changed and that it is over the invited number.
    expect(screen.getByText("2 → 4 лица")).toBeInTheDocument();
    expect(screen.getByText("+2 над поканетите")).toBeInTheDocument();

    const select = screen.getByLabelText("Чиј е одговорот од Ana Petrovska") as HTMLSelectElement;
    expect(select.value).toBe("g1");
    const groups = within(select).getAllByRole("group");
    expect(groups[0]).toHaveAttribute("label", "Најверојатно");
    fireEvent.click(screen.getByRole("button", { name: "Потврди" }));

    await waitFor(() => expect(onGuestChanged).toHaveBeenCalledWith(updated));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/couple/rsvp-answers/a1");
    expect(JSON.parse(init.body)).toEqual({ action: "guest", guest_id: "g1" });
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(0));
    expect(screen.queryByRole("heading", { name: /Да се провери/ })).not.toBeInTheDocument();
  });

  it("0184: a guest with a newer answer — the couple picks 'Примени го сепак' or 'Само поврзи'", async () => {
    const pending = makeAnswer({ suggestions: [{ id: "g1", fullName: "Ана Петровска" }] });
    const fetchMock = respond({ answers: [pending], pending: 1 });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Овој гостин има понов одговор (02.05 12:30).", conflict: { newer_at: "x" } }) });
    const onGuestChanged = vi.fn();
    render(<AnswersInbox guests={guests} menus={[]} onGuestChanged={onGuestChanged} onPendingChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Потврди" }));
    expect(await screen.findByText("Овој гостин има понов одговор (02.05 12:30).")).toBeInTheDocument();
    expect(onGuestChanged).not.toHaveBeenCalled();

    const linked = makeGuest({ rsvp_status: "declined" });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, guest: linked }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ answers: [{ ...pending, reviewState: "linked", guestId: "g1", guestName: "Ана Петровска" }], pending: 0 }) });
    fireEvent.click(screen.getByRole("button", { name: "Само поврзи" }));
    await waitFor(() => expect(onGuestChanged).toHaveBeenCalledWith(linked));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: "guest", guest_id: "g1", mode: "link" });
    expect(await screen.findByText("Само поврзано — бројките не се сменети")).toBeInTheDocument();
  });

  it("'Нов гостин' and 'Игнорирај' send their own action; a server error is shown", async () => {
    const fetchMock = respond({ answers: [makeAnswer()], pending: 1 });
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Овој одговор е веќе решен." }) });
    render(<AnswersInbox guests={guests} menus={[]} onGuestChanged={vi.fn()} onPendingChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Нов гостин" }));
    expect(await screen.findByText("Овој одговор е веќе решен.")).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "new" });

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, guest: null }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ answers: [], pending: 0 }) });
    fireEvent.click(screen.getByRole("button", { name: "Игнорирај" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: "ignore" }));
    expect(await screen.findByText("Сè уште нема одговори.")).toBeInTheDocument();
  });

  it("marks a guest the shared link created", async () => {
    respond({ answers: [makeAnswer({ match: "new", reviewState: "none", guestId: "g9", guestName: "Петар Нов", fullName: "Петар Нов" })], pending: 0 });
    render(<AnswersInbox guests={guests} menus={[]} onGuestChanged={vi.fn()} onPendingChange={vi.fn()} />);
    expect(await screen.findByText("нов гостин од линкот")).toBeInTheDocument();
  });
});

describe("GuestsClient answers tab", () => {
  it("shows the pending count and opens the inbox; flags a guest over the invited number", async () => {
    respond({ answers: [makeAnswer()], pending: 1 });
    const over = makeGuest({ rsvp_status: "confirmed", party_size: 5, invited_party_size: 3, household_names: ["Марко", "Ива"] });
    render(<GuestsClient initialGuests={[over]} initialStats={stats} eventType="birthday" pendingAnswers={1} />);
    expect(screen.getByText("+2 над поканетите")).toBeInTheDocument();
    expect(screen.getByText("Со: Марко, Ива")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Да се провери (1)" }));
    expect(await screen.findByRole("heading", { name: "Да се провери (1)" })).toBeInTheDocument();
  });
});

describe("CoupleAnswerForm (decision 7)", () => {
  const menus = [
    { id: "m", name: "Месо" },
    { id: "p", name: "Посно" },
  ];

  it("records a yes with the same checks as the guest form", async () => {
    const saved = makeGuest({ rsvp_status: "confirmed", party_size: 3 });
    const fetchMock = respond(saved);
    const onSaved = vi.fn();
    render(<CoupleAnswerForm guest={makeGuest()} menus={menus} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Внеси одговор" }));
    fireEvent.click(screen.getByRole("button", { name: "Потврден" }));
    const form = screen.getByRole("form", { name: "Внеси одговор" });
    fireEvent.change(within(form).getByRole("spinbutton", { name: "Број на лица" }), { target: { value: "3" } });
    fireEvent.change(within(form).getByRole("spinbutton", { name: "од кои деца" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај одговор" }));
    expect(await screen.findByText("Децата не можат да бидат повеќе од бројот на лица.")).toBeInTheDocument();

    fireEvent.change(within(form).getByRole("spinbutton", { name: "од кои деца" }), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Мени Месо"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај одговор" }));
    expect(await screen.findByText("Изберете мени за сите 3 лица.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Мени Посно"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Со кого доаѓа"), { target: { value: "Марко, Ива" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај одговор" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/couple/guests/g1/answers");
    expect(JSON.parse(init.body)).toEqual({
      status: "confirmed", party_size: 3, children_count: 1, menu_counts: { m: 1, p: 2 }, no_meal_count: 0, allergies: null, comment: null, household_names: ["Марко", "Ива"],
    });
  });

  it("0181: a child without a meal counts toward the split, never more than the children", async () => {
    const fetchMock = respond(makeGuest({ rsvp_status: "confirmed", party_size: 3 }));
    render(<CoupleAnswerForm guest={makeGuest()} menus={menus} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Внеси одговор" }));
    fireEvent.click(screen.getByRole("button", { name: "Потврден" }));
    const form = screen.getByRole("form", { name: "Внеси одговор" });
    fireEvent.change(within(form).getByRole("spinbutton", { name: "Број на лица" }), { target: { value: "3" } });
    expect(within(form).queryByRole("spinbutton", { name: "Деца без оброк" })).not.toBeInTheDocument();
    fireEvent.change(within(form).getByRole("spinbutton", { name: "од кои деца" }), { target: { value: "1" } });
    fireEvent.change(within(form).getByRole("spinbutton", { name: "Деца без оброк" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај одговор" }));
    expect(await screen.findByText("Децата без оброк не можат да бидат повеќе од децата.")).toBeInTheDocument();

    fireEvent.change(within(form).getByRole("spinbutton", { name: "Деца без оброк" }), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Мени Месо"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај одговор" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ party_size: 3, children_count: 1, menu_counts: { m: 2 }, no_meal_count: 1 });
  });

  it("0181: shrinking the party asks to fix the children and menus in the same form", () => {
    const guest = makeGuest({ rsvp_status: "confirmed", party_size: 4, children_count: 1, menu_counts: { m: 2, p: 2 } });
    render(<CoupleAnswerForm guest={guest} menus={menus} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Внеси одговор" }));
    fireEvent.click(screen.getByRole("button", { name: "Потврден" }));
    const form = screen.getByRole("form", { name: "Внеси одговор" });
    expect(screen.queryByText(/Бројот на лица се промени/)).not.toBeInTheDocument();
    fireEvent.change(within(form).getByRole("spinbutton", { name: "Број на лица" }), { target: { value: "2" } });
    expect(screen.getByText("Бројот на лица се промени — поправете ги децата и менијата погоре.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Мени Месо"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Мени Посно"), { target: { value: "1" } });
    expect(screen.queryByText(/Бројот на лица се промени/)).not.toBeInTheDocument();
  });

  it("a no sends only the status and comment", async () => {
    const fetchMock = respond(makeGuest({ rsvp_status: "declined" }));
    render(<CoupleAnswerForm guest={makeGuest()} menus={[]} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Внеси одговор" }));
    fireEvent.click(screen.getByRole("button", { name: "Одбиен" }));
    fireEvent.change(screen.getByLabelText("Коментар"), { target: { value: "Јави по телефон" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај одговор" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: "declined", comment: "Јави по телефон" });
  });
});

describe("AnswerHistory (decision 8)", () => {
  it("loads on demand and shows before → after per answer", async () => {
    respond({
      history: [
        {
          id: "h1", createdAt: "2027-05-02T09:30:00Z", source: "couple", comment: null,
          before: { status: "confirmed", party_size: 2, children_count: 0, menu_counts: {}, allergies: null, household_names: [] },
          after: { status: "declined", party_size: 2, children_count: 0, menu_counts: {}, allergies: null, household_names: [] },
        },
      ],
    });
    render(<AnswerHistory guestId="g1" menus={[]} />);
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Прикажи" }));
    expect(await screen.findByText(/Потврден → Одбиен/)).toBeInTheDocument();
    expect(screen.getByText(/Внесено од вас/)).toBeInTheDocument();
  });
});
