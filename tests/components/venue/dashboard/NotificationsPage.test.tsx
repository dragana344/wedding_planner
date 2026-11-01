import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/venue/current-venue", () => ({ getCurrentVenueId: vi.fn(async () => "v1") }));

const listVenueNotifications = vi.fn();
vi.mock("@/lib/venue/notifications", () => ({ listVenueNotifications: (...args: unknown[]) => listVenueNotifications(...args) }));

import NotificationsPage from "@/app/venue/notifications/page";

const item = { id: "n1", at: "2028-01-01T10:00:00Z", kind: "event_created" as const, color: "blue" as const, unseen: false, eventId: null, title: "Нов настан", detail: null };

describe("venue NotificationsPage", () => {
  beforeEach(() => listVenueNotifications.mockReset());

  it("places the range-picker arrow right next to the title, inside the same flex group", async () => {
    listVenueNotifications.mockResolvedValueOnce([item]);
    const { container } = render(await NotificationsPage({ searchParams: Promise.resolve({}) }));
    const heading = screen.getByText("Известувања");
    const group = heading.parentElement!;
    // The arrow button is a sibling of the <h2> inside a small flex group —
    // not pushed to the far end of panel-h by its own space-between.
    expect(group.querySelector("h2")).toBe(heading);
    expect(group.querySelector("button[aria-label^='Избери период']")).toBeTruthy();
    expect(container.querySelector(".count")?.textContent).toBe("последни 1");
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
      undefined
    );
  });

  it("asks for the colour before the limit, and the legend links keep the range", async () => {
    const red = { ...item, id: "n3", kind: "data_exported" as const, color: "red" as const, title: "Извоз на податоци" };
    listVenueNotifications.mockResolvedValueOnce([red]).mockResolvedValueOnce([red]);
    render(await NotificationsPage({ searchParams: Promise.resolve({ color: "red", notifFrom: "2028-01-01", notifTo: "2028-01-31" }) }));
    expect(listVenueNotifications).toHaveBeenNthCalledWith(1, {}, "v1", 50, undefined, "red");
    expect(listVenueNotifications).toHaveBeenNthCalledWith(2, {}, "v1", 200, expect.objectContaining({ from: expect.any(String) }), "red");
    const link = screen.getByRole("link", { name: "Приватност" });
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link.getAttribute("href")).toBe("/venue/notifications?notifFrom=2028-01-01&notifTo=2028-01-31&color=red");
  });
});
