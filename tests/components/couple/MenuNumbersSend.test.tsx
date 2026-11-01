import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MenuNumbersSend } from "@/components/couple/guests/MenuNumbersSend";

const numbers = { menus: [{ id: "m1", name: "Класично", count: 2 }], total: 2 };
const stateWith = (notDone: { id: string; full_name: string }[]) => ({
  current: numbers,
  notDone,
  latest: null,
  changedSinceLatest: false,
});
const json = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.restoreAllMocks());

describe("MenuNumbersSend", () => {
  it("re-reads the state after a failed send, still showing the error", async () => {
    let gets = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ error: "Уште 1 гостин нема конечен одговор." }, false);
      gets += 1;
      return json(stateWith(gets === 1 ? [] : [{ id: "g1", full_name: "Ана Петрова" }]));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MenuNumbersSend />);
    fireEvent.click(await screen.findByRole("button", { name: "Испрати ги бројките до салата" }));
    fireEvent.click(screen.getByRole("button", { name: "Потврди и испрати" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Уште 1 гостин нема конечен одговор.");
    await waitFor(() => expect(gets).toBe(2));
    expect(await screen.findByText(/чекаме одговор од: Ана Петрова/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Bug fix: the confirm dialog stays open on a failed send, and a guest
    // going "not done" while it's open must disable the send button too —
    // not just the reload before the dialog was ever opened.
    expect(screen.getByRole("button", { name: "Потврди и испрати" })).toBeDisabled();
  });

  it.each([
    [true, true],
    [false, false],
    [undefined, false],
  ])("coupleReminder %s: reminder banner shown = %s when nothing was sent", async (coupleReminder, shown) => {
    vi.stubGlobal("fetch", vi.fn(() => json({ ...stateWith([]), stage: "couple_reminder", coupleReminder })));
    render(<MenuNumbersSend />);
    await screen.findByRole("button", { name: "Испрати ги бројките до салата" });
    const banner = screen.queryByText("Испратете ги конечните бројки до салата");
    expect(Boolean(banner)).toBe(shown);
  });

  it("no banner once numbers were sent, whatever the stage", async () => {
    const latest = { id: "s1", sentAt: "2026-10-05T09:05:00Z", sentBy: "x", numbers, seenAt: null, seenBy: null, source: "couple", unanswered: null };
    vi.stubGlobal("fetch", vi.fn(() => json({ ...stateWith([]), latest, stage: "couple_reminder", coupleReminder: true })));
    render(<MenuNumbersSend />);
    await screen.findByText(/Испратено на/);
    expect(screen.queryByText("Испратете ги конечните бројки до салата")).toBeNull();
  });
});
