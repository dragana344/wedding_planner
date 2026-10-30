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
  });
});
