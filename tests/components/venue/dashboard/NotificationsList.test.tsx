import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationsList } from "@/components/venue/dashboard/NotificationsList";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";
import * as changesClient from "@/lib/venue/changes-client";
import * as numbersClient from "@/lib/venue/menu-numbers-client";
import type { VenueNotification } from "@/lib/venue/notifications";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});

const base: VenueNotification = {
  id: "n1", at: "2028-01-01T10:00:00Z", kind: "event_created", color: "blue", unseen: false, title: "Нов настан", detail: null, eventId: null,
};
const change: VenueNotification = {
  id: "c1", at: "2028-01-01T11:00:00Z", kind: "couple_change", color: "yellow", unseen: true, title: "Број на гости · Ана & Марко", detail: "100 → 120", eventId: "e1",
  seenAction: { eventId: "e1", section: "guest_count", upTo: "2028-01-01T11:00:00.123456+00:00" },
};
const numbers: VenueNotification = {
  id: "m1", at: "2028-01-01T12:00:00Z", kind: "menu_numbers", color: "green", unseen: true, title: "Бројки за мени · Ана & Марко", detail: "Вкупно 80", eventId: "e1",
  seenAction: { eventId: "e1", section: "menu_numbers", upTo: "2028-01-01T12:00:00Z", submissionId: "s1" },
};

function manager(ui: React.ReactElement, token: string | null = "tok") {
  const value = { token, managerName: token ? "Мена" : null } as React.ContextType<typeof ManagerElevationContext>;
  return render(<ManagerElevationContext.Provider value={value}>{ui}</ManagerElevationContext.Provider>);
}

describe("NotificationsList", () => {
  it("gives each row a leading spacer so .plan-row's 4-column grid doesn't crush time into name", () => {
    const { container } = render(<NotificationsList items={[base]} today="2028-01-01" />);
    const row = container.querySelector(".plan-row")!;
    expect(row.children[0]).toHaveClass("plan-dot");
    expect(row.children[1]).toHaveClass("plan-time");
    expect(row.children[2]).toHaveClass("plan-name");
  });

  it("shows the legend as filter links that keep other params, marks the active one, and clears with Сите", () => {
    render(<NotificationsList items={[base]} today="2028-01-01" legend={{ active: "green", params: { notifFrom: "2028-01-01" } }} />);
    const yellow = screen.getByRole("link", { name: "Промени од парот" });
    expect(yellow.getAttribute("href")).toBe("/venue/notifications?notifFrom=2028-01-01&color=yellow");
    expect(screen.getByRole("link", { name: "Бројки за мени" })).toHaveAttribute("aria-current", "true");
    expect(yellow).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("link").filter((l) => ["Настани", "Пристап", "Приватност"].includes(l.textContent ?? ""))).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Сите" }).getAttribute("href")).toBe("/venue/notifications?notifFrom=2028-01-01");
  });

  it("gives each row its colour class and the unseen sign only when unseen", () => {
    const { container } = render(<NotificationsList items={[base, change]} today="2028-01-01" />);
    const rows = container.querySelectorAll(".plan-row");
    expect(rows[0]).toHaveClass("notif-blue");
    expect(rows[1]).toHaveClass("notif-yellow");
    expect(container.querySelectorAll(".notif-blue")).toHaveLength(1);
    expect(screen.getAllByText("Не е видено")).toHaveLength(1);
  });

  it("hides Видено without a manager and shows it with one", () => {
    const { unmount } = manager(<NotificationsList items={[change]} today="2028-01-01" />, null);
    expect(screen.queryByRole("button", { name: "Видено" })).not.toBeInTheDocument();
    unmount();
    manager(<NotificationsList items={[change]} today="2028-01-01" />);
    expect(screen.getByRole("button", { name: "Видено" })).toBeInTheDocument();
  });

  it("works without any elevation provider (no button)", () => {
    render(<NotificationsList items={[change]} today="2028-01-01" />);
    expect(screen.queryByRole("button", { name: "Видено" })).not.toBeInTheDocument();
  });

  it("a change Видено sends the exact upTo, then refreshes", async () => {
    const spy = vi.spyOn(changesClient, "markChangesSeenViaApi").mockResolvedValue({ newer: false });
    manager(<NotificationsList items={[change]} today="2028-01-01" />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith("e1", "guest_count", "2028-01-01T11:00:00.123456+00:00", "tok");
  });

  it("a menu-numbers Видено uses the submission helper", async () => {
    const spy = vi.spyOn(numbersClient, "markMenuNumbersSeenViaApi").mockResolvedValue();
    manager(<NotificationsList items={[numbers]} today="2028-01-01" />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith("e1", "s1", "tok");
  });

  it("asks for a refresh when newer changes arrived", async () => {
    vi.spyOn(changesClient, "markChangesSeenViaApi").mockResolvedValue({ newer: true });
    manager(<NotificationsList items={[change]} today="2028-01-01" />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Има нови промени — освежете.");
  });

  it("shows a stale-numbers conflict as the refresh note and other errors as alerts", async () => {
    vi.spyOn(numbersClient, "markMenuNumbersSeenViaApi").mockRejectedValueOnce(new numbersClient.NewerMenuNumbersError("x"));
    manager(<NotificationsList items={[numbers]} today="2028-01-01" />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Има нови промени — освежете.");
    vi.spyOn(numbersClient, "markMenuNumbersSeenViaApi").mockRejectedValueOnce(new Error("Нема дозвола"));
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нема дозвола");
  });
});
