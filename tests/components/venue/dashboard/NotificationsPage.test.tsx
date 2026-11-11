import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/venue/current-venue", () => ({ getCurrentVenueId: vi.fn(async () => "v1") }));

const listVenueNotifications = vi.fn();
vi.mock("@/lib/venue/notifications", () => ({ listVenueNotifications: (...args: unknown[]) => listVenueNotifications(...args) }));
// Only shown once there are 2+ managers (see the page); empty here keeps these tests focused on the notification list itself.
vi.mock("@/lib/venue/managers", () => ({ listManagers: vi.fn(async () => []) }));

import NotificationsPage from "@/app/venue/notifications/page";

const item = { id: "n1", at: "2028-01-01T10:00:00Z", kind: "event_created" as const, color: "blue" as const, unseen: false, eventId: null, title: "Нов настан", detail: null };

describe("venue NotificationsPage", () => {
  beforeEach(() => listVenueNotifications.mockReset());

  it("puts the period picker in the search row and counts each pill", async () => {
    listVenueNotifications.mockResolvedValueOnce([item]);
    const { container } = render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    const tools = container.querySelector(".nf-tools")!;
    expect(tools.querySelector("input[type='search']")).toBeTruthy();
    expect(tools.querySelector("button[aria-label^='Избери период']")).toHaveTextContent("По период");
    expect(screen.getByRole("link", { name: "Сите" })).toHaveTextContent("Сите1");
    expect(screen.getByRole("link", { name: "Настани" })).toHaveTextContent("Настани1");
    // No colour filter: the one list feeds the counts, no extra query.
    expect(listVenueNotifications).toHaveBeenCalledTimes(1);
  });

  it("shows the ranged results inside the popup once a period is selected", async () => {
    listVenueNotifications.mockResolvedValueOnce([item]); // default last-50 call
    listVenueNotifications.mockResolvedValueOnce([{ ...item, id: "n2", title: "Стар настан" }]); // ranged call
    render(await NotificationsPage({ searchParams: Promise.resolve({ notifFrom: "2028-01-01", notifTo: "2028-01-31" }) }));
    expect(screen.getByText("Стар настан")).toBeInTheDocument();
    expect(listVenueNotifications).toHaveBeenLastCalledWith(
      {},
      "v1",
      200,
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      undefined,
      undefined
    );
  });

  it("asks for the colour before the limit, and the legend links keep the range", async () => {
    const red = { ...item, id: "n3", kind: "data_exported" as const, color: "red" as const, title: "Извоз на податоци" };
    listVenueNotifications.mockResolvedValueOnce([red]).mockResolvedValueOnce([red, item]).mockResolvedValueOnce([red]);
    render(await NotificationsPage({ searchParams: Promise.resolve({ color: "red", notifFrom: "2028-01-01", notifTo: "2028-01-31" }) }));
    expect(listVenueNotifications).toHaveBeenNthCalledWith(1, {}, "v1", 50, undefined, "red", undefined);
    // The pill counts come from the unfiltered list, so every pill keeps its number.
    expect(listVenueNotifications).toHaveBeenNthCalledWith(2, {}, "v1", 50, undefined, undefined, undefined);
    expect(listVenueNotifications).toHaveBeenNthCalledWith(3, {}, "v1", 200, expect.objectContaining({ from: expect.any(String) }), "red", undefined);
    expect(screen.getByRole("link", { name: "Сите" })).toHaveTextContent("Сите2");
    const link = screen.getByRole("link", { name: "Приватност" });
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link.getAttribute("href")).toBe("/venue/notifications?notifFrom=2028-01-01&notifTo=2028-01-31&color=red");
  });
});
