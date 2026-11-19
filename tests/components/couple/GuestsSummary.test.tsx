import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuestsSummary } from "@/components/couple/guests/GuestsSummary";
import type { GuestStats } from "@/lib/couple/guests";

const stats: GuestStats = {
  total: 3,
  confirmed: 2,
  declined: 1,
  pending: 0,
  invited: 0,
  later: 0,
  totalAttending: 4,
  childrenAttending: 0,
  noMeal: 0,
  menuRechoose: 0,
  menus: [
    { id: "m1", name: "Класично", count: 3 },
    { id: "m2", name: "Посно", count: 1 },
  ],
  notDone: [],
  invitationsSent: 0,
  allergyNotes: [],
};
const current = { menus: stats.menus, total: 4 };
const latestOf = (numbers = current) => ({ id: "s1", sentAt: "2026-10-05T07:05:00Z", sentBy: "Младенците", numbers, seenAt: null, seenBy: null });

function mockGet(body: object) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
}

afterEach(() => vi.restoreAllMocks());

describe("GuestsSummary send numbers", () => {
  it("0182: not everyone answered — send stays open, with the answer counts, the names and a prefilled estimate", async () => {
    mockGet({
      current,
      notDone: [{ id: "g", full_name: "Борис", people: 2 }, { id: "h", full_name: "Васил", people: 2 }],
      allergyNotes: [],
      answers: { answeredGuests: 3, answeredPeople: 4, unansweredGuests: 2, unansweredPeople: 4 },
      prefill: { m1: 3, m2: 1 },
      latest: null,
      changedSinceLatest: false,
    });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    const btn = await screen.findByRole("button", { name: "Испрати ги бројките до салата" });
    expect(btn).toBeEnabled();
    expect(screen.getByText("Одговориле: 3 гости (4 лица) · Без одговор: 2 гости")).toBeInTheDocument();
    expect(screen.getByText(/Борис, Васил/)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByLabelText("Проценка: Класично")).toHaveValue(3);
    expect(screen.getByLabelText("Проценка: Посно")).toHaveValue(1);
    expect(screen.getByText("Класично: 6 (од кои проценка: 3)")).toBeInTheDocument();
    expect(screen.getByText("Вкупно лица: 8 (од кои проценка: 4)")).toBeInTheDocument();
  });

  it("0182: sends the edited estimate; an empty field blocks the send", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current, notDone: [{ id: "g", full_name: "Борис", people: 2 }], allergyNotes: [], prefill: { m1: 2, m2: 0 }, latest: null, changedSinceLatest: false }),
    });
    global.fetch = fetchMock;
    render(<GuestsSummary stats={stats} canSendNumbers />);
    fireEvent.click(await screen.findByRole("button", { name: "Испрати ги бројките до салата" }));
    fireEvent.change(screen.getByLabelText("Проценка: Посно"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Потврди и испрати" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Проценка: Посно"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Потврди и испрати" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/couple/menu-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allergy_summary: null, estimate: { m1: 2, m2: 1 } }),
      }),
    );
  });

  it("enabled when everyone is done, confirm shows numbers", async () => {
    mockGet({ current, notDone: [], allergyNotes: [], latest: null, changedSinceLatest: false });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    fireEvent.click(await screen.findByRole("button", { name: "Испрати ги бројките до салата" }));
    expect(screen.getByText("Класично: 3")).toBeInTheDocument();
    expect(screen.getByText("Посно: 1")).toBeInTheDocument();
    expect(screen.getByText("Вкупно оброци: 4")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Проценка:/)).toBeNull();
  });

  it("posts on confirm, then re-fetches and shows when it was sent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current, notDone: [], allergyNotes: [], latest: null, changedSinceLatest: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => latestOf() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current, notDone: [], allergyNotes: [], latest: latestOf(), changedSinceLatest: false }) });
    global.fetch = fetchMock;
    render(<GuestsSummary stats={stats} canSendNumbers />);
    fireEvent.click(await screen.findByRole("button", { name: "Испрати ги бројките до салата" }));
    fireEvent.click(screen.getByRole("button", { name: "Потврди и испрати" }));
    expect(await screen.findByText("Испратено на 05.10.2026 09:05: 4 лица")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/couple/menu-numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allergy_summary: null }),
    });
  });

  it("with changes: lists them and offers the updated send", async () => {
    const old = { menus: [{ id: "m1", name: "Класично", count: 3 }, { id: "m2", name: "Посно", count: 0 }], total: 3 };
    mockGet({ current, notDone: [], allergyNotes: [], latest: latestOf(old), changedSinceLatest: true });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    expect(await screen.findByText("Бројките се променети по испраќањето — испратете ги повторно")).toBeInTheDocument();
    expect(screen.getByText(/\(Посно \+1\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Испрати повторно" })).toBeEnabled();
  });

  it("changed but no per-menu difference: says so without a dangling list", async () => {
    mockGet({ current, notDone: [], allergyNotes: [], latest: latestOf(current), changedSinceLatest: true });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    expect(await screen.findByText("Бројките се променети по испраќањето — испратете ги повторно")).toBeInTheDocument();
    expect(screen.queryByText(/\(.*[+−]\d+\)/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Испрати повторно" })).toBeEnabled();
  });

  it("co-organizers get no send area and no request", async () => {
    global.fetch = vi.fn();
    render(<GuestsSummary stats={stats} />);
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
  });
});
