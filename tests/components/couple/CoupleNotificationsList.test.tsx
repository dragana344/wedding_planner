import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CoupleNotificationsList } from "@/components/couple/CoupleNotificationsList";
import type { CoupleNotification } from "@/lib/couple/notifications";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.restoreAllMocks();
  refresh.mockClear();
});

const change = (id: string, at: string, section: "menus" | "finance", unseen: boolean): CoupleNotification => ({
  id, at, kind: "venue_change", section, title: section === "menus" ? "Мени" : "Финансии", detail: "детали", unseen,
});
const reply: CoupleNotification = { id: "rsvp-1", at: "2028-01-02T09:30:00Z", kind: "guest_reply", title: "Марија", detail: "Доаѓа", unseen: true };
const reminder: CoupleNotification = { id: "rem-1", at: "2028-01-01T08:00:00Z", kind: "reminder", title: "Салата ве потсети да ги испратите бројките", detail: null, unseen: false };
const c1 = change("chg-1", "2028-01-01T10:00:00.111Z", "menus", true);
const c2 = change("chg-2", "2028-01-01T11:00:00.222Z", "menus", true);

function mockFetch(body: unknown = { ok: true }, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok, json: async () => body } as Response);
}

describe("CoupleNotificationsList", () => {
  it("groups by Skopje day with dd.mm.yyyy headings and shows the time", () => {
    render(<CoupleNotificationsList items={[reply, c2, c1, reminder]} active={null} />);
    expect(screen.getByRole("heading", { name: "02.01.2028" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "01.01.2028" })).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument(); // 09:30Z is 10:30 in Skopje
  });

  it("renders the legend as links, Сите clearing, with aria-current on the active one", () => {
    render(<CoupleNotificationsList items={[reply]} active="green" />);
    const nav = screen.getByRole("navigation", { name: "Филтер по боја" });
    expect(within(nav).getByRole("link", { name: "Сите" })).toHaveAttribute("href", "/couple/notifications");
    const green = within(nav).getByRole("link", { name: "Одговори од гости" });
    expect(green).toHaveAttribute("href", "/couple/notifications?color=green");
    expect(green).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("link", { name: "Промени од салата" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Потсетници" })).toHaveClass("notif-blue");
  });

  it("marks Сите current when unfiltered", () => {
    render(<CoupleNotificationsList items={[reply]} active={null} />);
    expect(screen.getByRole("link", { name: "Сите" })).toHaveAttribute("aria-current", "true");
  });

  it("colours each item by kind", () => {
    const { container } = render(<CoupleNotificationsList items={[reply, c1, reminder]} active={null} />);
    const rows = container.querySelectorAll("li");
    expect(rows[0]).toHaveClass("notif-green");
    expect(rows[1]).toHaveClass("notif-yellow");
    expect(rows[2]).toHaveClass("notif-blue");
  });

  it("unseen venue change shows Не е видено and posts the section with the newest unseen time of that section", async () => {
    const fetchMock = mockFetch();
    render(<CoupleNotificationsList items={[c2, c1]} active={null} />);
    expect(screen.getAllByText("Не е видено")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Видено" })[1]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/couple/changes/seen");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ section: "menus", up_to: c2.at });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("a seen venue change has no badge or button", () => {
    render(<CoupleNotificationsList items={[change("chg-3", "2028-01-01T10:00:00Z", "finance", false)]} active={null} />);
    expect(screen.queryByText("Не е видено")).toBeNull();
    expect(screen.queryByRole("button", { name: "Видено" })).toBeNull();
  });

  it("unseen guest reply shows Ново without a button; reminders are plain", () => {
    render(<CoupleNotificationsList items={[reply, reminder]} active={null} />);
    expect(screen.getByText("Ново")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Не е видено")).toBeNull();
  });

  it("tells the couple to refresh when a newer change arrived", async () => {
    mockFetch({ ok: true, newer: true });
    render(<CoupleNotificationsList items={[c1]} active={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Има нови промени — освежете.");
  });

  it("shows an error alert when saving fails", async () => {
    mockFetch({ error: "Не успеа." }, false);
    render(<CoupleNotificationsList items={[c1]} active={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не успеа.");
  });

  it("shows the empty state, keeping the legend", () => {
    render(<CoupleNotificationsList items={[]} active={null} />);
    expect(screen.getByText("Нема известувања.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Филтер по боја" })).toBeInTheDocument();
  });
});
