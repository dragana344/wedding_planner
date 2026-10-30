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
  menus: [
    { id: "m1", name: "Класично", count: 3 },
    { id: "m2", name: "Посно", count: 1 },
  ],
  notDone: [],
  invitationsSent: 0,
};
const current = { menus: stats.menus, total: 4 };
const latestOf = (numbers = current) => ({ id: "s1", sentAt: "2026-10-05T07:05:00Z", sentBy: "Младенците", numbers, seenAt: null, seenBy: null });

function mockGet(body: object) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
}

afterEach(() => vi.restoreAllMocks());

describe("GuestsSummary send numbers", () => {
  it("send disabled with the not-done names", async () => {
    mockGet({ current, notDone: [{ id: "g", full_name: "Борис" }, { id: "h", full_name: "Васил" }], latest: null, changedSinceLatest: false });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    const btn = await screen.findByRole("button", { name: "Испрати ги бројките до салата" });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/Борис, Васил/)).toBeInTheDocument();
  });

  it("enabled when everyone is done, confirm shows numbers", async () => {
    mockGet({ current, notDone: [], latest: null, changedSinceLatest: false });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    fireEvent.click(await screen.findByRole("button", { name: "Испрати ги бројките до салата" }));
    expect(screen.getByText("Класично: 3")).toBeInTheDocument();
    expect(screen.getByText("Посно: 1")).toBeInTheDocument();
    expect(screen.getByText("Вкупно: 4")).toBeInTheDocument();
  });

  it("posts on confirm, then re-fetches and shows when it was sent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current, notDone: [], latest: null, changedSinceLatest: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => latestOf() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current, notDone: [], latest: latestOf(), changedSinceLatest: false }) });
    global.fetch = fetchMock;
    render(<GuestsSummary stats={stats} canSendNumbers />);
    fireEvent.click(await screen.findByRole("button", { name: "Испрати ги бројките до салата" }));
    fireEvent.click(screen.getByRole("button", { name: "Потврди и испрати" }));
    expect(await screen.findByText("Испратено на 05.10.2026 09:05")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/couple/menu-numbers", { method: "POST" });
  });

  it("with changes: lists them and offers the updated send", async () => {
    const old = { menus: [{ id: "m1", name: "Класично", count: 3 }, { id: "m2", name: "Посно", count: 0 }], total: 3 };
    mockGet({ current, notDone: [], latest: latestOf(old), changedSinceLatest: true });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    expect(await screen.findByText("Има промени од последното испраќање: Посно +1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Испрати ажурирани бројки" })).toBeEnabled();
  });

  it("changed but no per-menu difference: says so without a dangling list", async () => {
    mockGet({ current, notDone: [], latest: latestOf(current), changedSinceLatest: true });
    render(<GuestsSummary stats={stats} canSendNumbers />);
    expect(await screen.findByText("Има промени од последното испраќање.")).toBeInTheDocument();
    expect(screen.queryByText(/испраќање:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Испрати ажурирани бројки" })).toBeEnabled();
  });

  it("co-organizers get no send area and no request", async () => {
    global.fetch = vi.fn();
    render(<GuestsSummary stats={stats} />);
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
    expect(screen.queryByRole("button")).toBeNull();
  });
});
