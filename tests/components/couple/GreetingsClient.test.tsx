import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GreetingsClient } from "@/components/couple/GreetingsClient";
import type { Greeting } from "@/lib/media/greetings";

// C2/C7: the couple reads their guests' greetings and can hide or delete them.

const greeting = (id: string, over: Partial<Greeting> = {}): Greeting => ({
  id, firstName: "Ана", lastName: "Петрова", message: "Честито и среќен живот!", videoUrl: null, hidden: false,
  createdAt: "2027-06-12T20:15:00Z", ...over,
});

beforeEach(() => {
  global.fetch = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;
});

describe("GreetingsClient", () => {
  it("shows each greeting with the guest's full name, message and date", () => {
    render(<GreetingsClient initialGreetings={[greeting("g1")]} />);
    const card = screen.getByTestId("greeting-g1");
    expect(within(card).getByText("Ана Петрова")).toBeInTheDocument();
    expect(within(card).getByText("Честито и среќен живот!")).toBeInTheDocument();
    expect(within(card).getByText("12.06.2027")).toBeInTheDocument();
  });

  it("plays a video greeting on demand", () => {
    render(<GreetingsClient initialGreetings={[greeting("g2", { videoUrl: "https://storage.test/v.mp4" })]} />);
    const video = screen.getByTestId("greeting-g2").querySelector("video")!;
    expect(video).toHaveAttribute("src", "https://storage.test/v.mp4");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("preload", "none");
  });

  it("explains where greetings come from when there are none", () => {
    render(<GreetingsClient initialGreetings={[]} />);
    expect(screen.getByText(/Сè уште нема честитки/)).toHaveTextContent("Сè уште нема честитки. Споделете го QR кодот од Албум.");
    expect(screen.getByRole("link", { name: "Албум" })).toHaveAttribute("href", "/couple/album");
  });

  it("hides and shows a greeting", async () => {
    render(<GreetingsClient initialGreetings={[greeting("g3")]} />);
    const card = screen.getByTestId("greeting-g3");
    await userEvent.click(within(card).getByRole("button", { name: "Скриј" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/couple/greetings/g3", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ hidden: true }) }));
    await waitFor(() => expect(within(card).getByText("Скриена")).toBeInTheDocument());
  });

  it("deletes a greeting after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<GreetingsClient initialGreetings={[greeting("g4")]} />);
    await userEvent.click(within(screen.getByTestId("greeting-g4")).getByRole("button", { name: "Избриши" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/couple/greetings/g4", expect.objectContaining({ method: "DELETE" }));
    await waitFor(() => expect(screen.queryByTestId("greeting-g4")).not.toBeInTheDocument());
  });
});
