import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";
import * as eventsLib from "@/lib/venue/events";
import * as menuNumbersClient from "@/lib/venue/menu-numbers-client";
import { EventsClient } from "@/components/venue/dashboard/EventsClient";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";
import type { EventDetail } from "@/lib/venue/events";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
// The edit form loads photos and the couple's username on mount; stub them so
// a unit test never sends a request to Supabase.
vi.mock("@/lib/venue/showcase", async (orig) => ({ ...(await orig<object>()), listShowcasePhotos: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/venue/credentials", async (orig) => ({ ...(await orig<object>()), getEventUsername: vi.fn().mockResolvedValue("ana-marko") }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const event: EventDetail = {
  id: "e1", couple_names: "Ана & Марко", event_date: "2027-06-12", start_time: null, end_time: null, status: "confirmed",
  event_type: "wedding", guest_count_estimate: 100, menus: [], room_ids: [],
  hasShowcasePhotos: false, seatedCount: 0, contact_email: null, contact_email_2: null, contact_phone: null, total_price: null, deposit_paid: null, hasUnseenSeatingChange: false,
  menuNumbers: { latest: null, previous: null },
};

describe("EventsClient deep link (B9 notifications)", () => {
  it("opens the event named in ?event=", () => {
    const { container } = render(<ManagerElevationProvider><EventsClient venueId="v1" initialEvents={[event]} rooms={[]} menuTemplates={[]} initialFilter="all" initialEventId="e1" /></ManagerElevationProvider>);
    expect(container.ownerDocument.querySelector(".modal-panel")).not.toBeNull();
  });

  it("ignores an unknown id", () => {
    const { container } = render(<ManagerElevationProvider><EventsClient venueId="v1" initialEvents={[event]} rooms={[]} menuTemplates={[]} initialFilter="all" initialEventId="nope" /></ManagerElevationProvider>);
    expect(container.ownerDocument.querySelector(".modal-panel")).toBeNull();
  });

  it("Настани list shows all menu names or Без мени", () => {
    const withMenus = { ...event, id: "e2", couple_names: "Две мени", menus: [
      { id: "a", name: "Класично", isCustom: false, items: [] },
      { id: "b", name: "Посно", isCustom: false, items: [] },
    ] };
    render(<ManagerElevationProvider><EventsClient venueId="v1" initialEvents={[event, withMenus]} rooms={[]} menuTemplates={[]} initialFilter="all" /></ManagerElevationProvider>);
    expect(screen.getByText("Класично, Посно")).toBeInTheDocument();
    expect(screen.getByText("Без мени")).toBeInTheDocument();
  });

  it("the list's menu modal shows one titled block per menu", () => {
    const withMenus = { ...event, id: "e3", couple_names: "Групи", menus: [
      { id: "a", name: "Класично", isCustom: false, items: [] },
      { id: "c", name: "Сопствено", isCustom: true, items: [{ id: "d2", name: "Торта", course: "dessert", photo_path: null }] },
    ] };
    const templates = [{ id: "a", venue_id: "v1", name: "Класично", description: null, items: [{ id: "d1", name: "Супа", course: "starter", photo_path: null }] }];
    render(<ManagerElevationProvider><EventsClient venueId="v1" initialEvents={[withMenus]} rooms={[]} menuTemplates={templates as never} initialFilter="all" /></ManagerElevationProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Класично, Сопствено" }));
    const cards = Array.from(document.querySelectorAll(".modal-panel .mp-menu-card"));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Класично");
    expect(cards[0]).toHaveTextContent("Супа");
    expect(cards[0]).not.toHaveTextContent("Торта");
    expect(cards[1]).toHaveTextContent("Сопствено");
    expect(cards[1]).toHaveTextContent("Торта");
  });

  it("Настани shows \"Нови бројки\" only while unseen", () => {
    const sub = (seenAt: string | null) => ({ id: "s", sentAt: "2026-06-14T10:00:00Z", sentBy: "Младенците", numbers: { menus: [{ id: "a", name: "Класично", count: 2 }], total: 2 }, seenAt, seenBy: seenAt ? "Марко" : null });
    const unseen = { ...event, id: "u1", couple_names: "Нови", menuNumbers: { latest: sub(null), previous: null } };
    const seen = { ...event, id: "u2", couple_names: "Видени", menuNumbers: { latest: sub("2026-06-15T10:00:00Z"), previous: null } };
    render(<ManagerElevationProvider><EventsClient venueId="v1" initialEvents={[seen]} rooms={[]} menuTemplates={[]} initialFilter="all" /></ManagerElevationProvider>);
    expect(screen.queryByText("Нови бројки")).not.toBeInTheDocument();
    cleanup();
    render(<ManagerElevationProvider><EventsClient venueId="v1" initialEvents={[unseen]} rooms={[]} menuTemplates={[]} initialFilter="all" /></ManagerElevationProvider>);
    expect(screen.getByText("Нови бројки")).toBeInTheDocument();
  });

  it("an open event reflects refreshed data (Видено clears the highlight without closing)", async () => {
    const sub = (seenAt: string | null) => ({ id: "s", sentAt: "2026-06-14T10:00:00Z", sentBy: "Младенците", numbers: { menus: [{ id: "a", name: "Класично", count: 2 }], total: 2 }, seenAt, seenBy: seenAt ? "Марко" : null });
    const unseen = { ...event, menuNumbers: { latest: sub(null), previous: null } };
    const seen = { ...event, menuNumbers: { latest: sub("2026-06-15T10:00:00Z"), previous: null } };
    vi.spyOn(menuNumbersClient, "markMenuNumbersSeenViaApi").mockResolvedValue(undefined);
    vi.spyOn(eventsLib, "listEventsWithDetails").mockResolvedValue([seen]);
    const manager = { managerName: "Марко", isOwner: false, token: "t", elevate: async () => ({ ok: true as const }), deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {} };
    render(<ManagerElevationContext.Provider value={manager}><EventsClient venueId="v1" initialEvents={[unseen]} rooms={[]} menuTemplates={[]} initialFilter="all" initialEventId="e1" /></ManagerElevationContext.Provider>);
    expect(screen.getByText("Нови бројки од парот")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    await waitFor(() => expect(screen.queryByText("Нови бројки од парот")).not.toBeInTheDocument());
    expect(document.querySelector(".modal-panel")).not.toBeNull();
  });
});
