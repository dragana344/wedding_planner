import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// next/font is compiled by Next, not available under jsdom.
vi.mock("next/font/google", () => ({
  Cormorant_Garamond: () => ({ className: "font" }),
}));

import { EventHeroCard } from "@/components/couple/EventHeroCard";

afterEach(() => {
  vi.useRealTimers();
});

const BASE_PROPS = {
  coupleNames: "Ивана и Марко",
  eventDate: "2026-10-18",
  startTime: "19:00:00" as string | null,
  endTime: "23:00:00" as string | null,
  venueName: "Хотел Империал",
  guestCount: 120 as number | null,
};

describe("EventHeroCard", () => {
  it("splits the couple names and styles the conjunction, shows the weekday date", async () => {
    render(
      <EventHeroCard
        {...BASE_PROPS}
        startIso="2026-10-20T00:00:00.000Z"
        endIso="2026-10-20T04:00:00.000Z"
      />,
    );
    expect(screen.getByRole("heading", { name: "Ивана и Марко" })).toBeInTheDocument();
    expect(screen.getByText("и")).toBeInTheDocument(); // the conjunction has its own styled span
    expect(screen.getByText("недела, 18 октомври 2026")).toBeInTheDocument();
  });

  it("shows a live days/hours/minutes countdown to the start, ticking every 30s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T00:00:00.000Z"));
    render(
      <EventHeroCard
        {...BASE_PROPS}
        startIso="2026-10-20T10:30:00.000Z"
        endIso="2026-10-20T14:00:00.000Z"
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("02")).toBeInTheDocument(); // days
    expect(screen.getByText("10")).toBeInTheDocument(); // hours
    expect(screen.getByText("30")).toBeInTheDocument(); // minutes
    expect(screen.getByText("ДЕНА")).toBeInTheDocument();

    vi.setSystemTime(new Date("2026-10-18T00:01:00.000Z"));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("28")).toBeInTheDocument(); // minutes ticked down
  });

  it("shows 'Денес е вашиот ден' once started, and the congratulations message after it ends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T11:00:00.000Z")); // between start and end
    const { rerender } = render(
      <EventHeroCard {...BASE_PROPS} startIso="2026-10-20T10:30:00.000Z" endIso="2026-10-20T14:00:00.000Z" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Денес е вашиот ден")).toBeInTheDocument();

    vi.setSystemTime(new Date("2026-10-20T15:00:00.000Z")); // after end
    rerender(<EventHeroCard {...BASE_PROPS} startIso="2026-10-20T10:30:00.000Z" endIso="2026-10-20T14:00:00.000Z" />);
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("Честитки, младенци!")).toBeInTheDocument();
  });

  it("shows the time range and venue name, hides the time range when missing", () => {
    const { unmount } = render(<EventHeroCard {...BASE_PROPS} startIso="2026-10-20T00:00:00.000Z" endIso="2026-10-20T04:00:00.000Z" />);
    expect(screen.getByText("19:00 – 23:00")).toBeInTheDocument();
    expect(screen.getByText("Хотел Империал")).toBeInTheDocument();
    unmount();

    render(
      <EventHeroCard {...BASE_PROPS} startTime={null} endTime={null} startIso="2026-10-20T00:00:00.000Z" endIso="2026-10-20T04:00:00.000Z" />,
    );
    expect(screen.queryByText("19:00 – 23:00")).not.toBeInTheDocument();
    expect(screen.getByText("Хотел Империал")).toBeInTheDocument();
  });

  it("renders the guest count editor", () => {
    render(<EventHeroCard {...BASE_PROPS} startIso="2026-10-20T00:00:00.000Z" endIso="2026-10-20T04:00:00.000Z" />);
    expect(screen.getByText("120 гости")).toBeInTheDocument();
  });
});
