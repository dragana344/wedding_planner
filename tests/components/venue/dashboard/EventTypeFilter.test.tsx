import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventTypeFilter } from "@/components/venue/dashboard/EventTypeFilter";
import { TYPE_META } from "@/lib/venue/event-display";
import type { EventType } from "@/lib/venue/events";

function counts(overrides: Partial<Record<EventType, number>> = {}): Record<EventType, number> {
  return { ...(Object.fromEntries(Object.keys(TYPE_META).map((t) => [t, 0])) as Record<EventType, number>), ...overrides };
}

describe("EventTypeFilter", () => {
  it("shows Сите plus the three most-booked types as chips, not every type", () => {
    render(<EventTypeFilter value="all" counts={counts({ birthday: 5, wedding: 9, seminar: 2, baptism: 1 })} total={17} onChange={() => {}} />);
    const chips = screen.getAllByRole("button", { pressed: false }).concat(screen.getAllByRole("button", { pressed: true }));
    expect(chips.map((c) => c.textContent)).toEqual(expect.arrayContaining(["Сите 17", "Свадба 9", "Роденден 5", "Семинар / Обука 2"]));
    expect(screen.queryByRole("button", { name: /Крштевање/ })).not.toBeInTheDocument();
  });

  it("falls back to wedding, birthday and corporate when nothing is booked yet", () => {
    render(<EventTypeFilter value="all" counts={counts()} total={0} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^Свадба/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Роденден/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Корпоративен настан/ })).toBeInTheDocument();
  });

  it("lists every type in the dropdown and picks one, closing it", async () => {
    const onChange = vi.fn();
    render(<EventTypeFilter value="all" counts={counts({ wedding: 3 })} total={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Повеќе видови/ }));
    const menu = screen.getByRole("menu", { name: "Сите видови настани" });
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(Object.keys(TYPE_META).length);
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Крштевање/ }));
    expect(onChange).toHaveBeenCalledWith("baptism");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows a type picked from the dropdown as an active chip that clears back to Сите", async () => {
    const onChange = vi.fn();
    render(<EventTypeFilter value="baptism" counts={counts({ wedding: 3, birthday: 3, corporate: 2, baptism: 1 })} total={9} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /^Крштевање/, pressed: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Исчисти филтер" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("closes the dropdown on Escape and on a click outside", async () => {
    render(
      <div>
        <p>outside</p>
        <EventTypeFilter value="all" counts={counts()} total={0} onChange={() => {}} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Повеќе видови/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Повеќе видови/ }));
    await userEvent.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
