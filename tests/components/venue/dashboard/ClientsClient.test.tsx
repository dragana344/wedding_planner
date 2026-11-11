import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";
import { ClientsClient } from "@/components/venue/dashboard/ClientsClient";
import type { EventDetail } from "@/lib/venue/events";

const eventsClient = vi.hoisted(() => ({ deleteEventViaApi: vi.fn() }));
vi.mock("@/lib/venue/events-client", async (orig) => ({ ...(await orig<object>()), ...eventsClient }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/date", async (orig) => ({ ...(await orig<object>()), todayIn: () => "2027-06-01" }));

function ev(overrides: Partial<EventDetail>): EventDetail {
  return {
    id: "e", couple_names: "Х", event_date: "2027-07-01", start_time: null, end_time: null, status: "confirmed",
    event_type: "wedding", guest_count_estimate: null, seating_self_edit_enabled: null, seating_mode: "full", created_at: "2026-01-01T10:00:00Z",
    menus: [], room_ids: [], hasShowcasePhotos: false, seatedCount: 0, contact_email: null, contact_email_2: null, contact_phone: null,
    total_price: null, deposit_paid: null, unseenSections: [], menuNumbers: { latest: null, previous: null },
    ...overrides,
  };
}

const events = [
  ev({ id: "up", couple_names: "Идна Свадба", event_date: "2027-07-10" }),
  ev({ id: "past", couple_names: "Стара Свадба", event_date: "2027-05-10" }),
  ev({ id: "done", couple_names: "Завршен Роденден", event_date: "2027-06-20", status: "completed", event_type: "birthday" }),
];

const manager = {
  managerName: "Марко", isOwner: false, token: "tok", elevate: async () => ({ ok: true as const }),
  deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {},
};

function renderClients() {
  return render(
    <ManagerElevationContext.Provider value={manager}>
      <ClientsClient />
    </ManagerElevationContext.Provider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  let current = events;
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ venueId: "v1", events: current, rooms: [], menuTemplates: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  eventsClient.deleteEventViaApi.mockImplementation(async (id: string) => {
    current = current.filter((e) => e.id !== id);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("ClientsClient — finished events", () => {
  it("lists active clients first and moves past or completed events into a Завршени section below", async () => {
    renderClients();
    const finished = await screen.findByRole("region", { name: "Завршени настани" });
    expect(within(finished).getByText("Стара Свадба")).toBeInTheDocument();
    expect(within(finished).getByText("Завршен Роденден")).toBeInTheDocument();
    expect(within(finished).queryByText("Идна Свадба")).not.toBeInTheDocument();
    expect(screen.getByText("Активни: 1 · Завршени: 2 · Вкупно 3 клиенти")).toBeInTheDocument();
  });

  it("lets a manager delete a finished event after confirming", async () => {
    renderClients();
    const finished = await screen.findByRole("region", { name: "Завршени настани" });
    await userEvent.click(within(finished).getByRole("button", { name: "Избриши го настанот Стара Свадба" }));
    expect(eventsClient.deleteEventViaApi).not.toHaveBeenCalled();
    await userEvent.click(within(finished).getByRole("button", { name: "Избриши" }));
    await waitFor(() => expect(eventsClient.deleteEventViaApi).toHaveBeenCalledWith("past", "tok"));
    await waitFor(() => expect(screen.queryByText("Стара Свадба")).not.toBeInTheDocument());
  });

  it("can cancel the delete, and active clients have no delete button", async () => {
    renderClients();
    const finished = await screen.findByRole("region", { name: "Завршени настани" });
    await userEvent.click(within(finished).getByRole("button", { name: "Избриши го настанот Стара Свадба" }));
    await userEvent.click(within(finished).getByRole("button", { name: "Откажи" }));
    expect(eventsClient.deleteEventViaApi).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Избриши го настанот Идна Свадба" })).not.toBeInTheDocument();
  });

  it("collapses the finished section", async () => {
    renderClients();
    await screen.findByRole("region", { name: "Завршени настани" });
    await userEvent.click(screen.getByRole("button", { name: /Завршени настани/ }));
    expect(screen.queryByText("Стара Свадба")).not.toBeInTheDocument();
  });

  it("shows WhatsApp/Viber quick-contact links next to a client's phone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ venueId: "v1", events: [ev({ contact_phone: "070 555 444" })], rooms: [], menuTemplates: [] }),
          { status: 200 },
        ),
      ),
    );
    renderClients();
    await screen.findByText("070 555 444");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/38970555444");
    expect(screen.getByRole("link", { name: "Viber" })).toHaveAttribute("href", "viber://forward");
  });
});

describe("ClientsClient — paging", () => {
  it("shows 10 clients, then 10 more per click until none are left, and starts over on a new filter", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      ev({ id: `a${i}`, couple_names: `Клиент ${String(i + 1).padStart(2, "0")}`, event_date: `2027-08-${String(i + 1).padStart(2, "0")}` }),
    );
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ venueId: "v1", events: many, rooms: [], menuTemplates: [] }), { status: 200 }));
    renderClients();
    await screen.findByText("Клиент 01");
    const rows = () => screen.queryAllByText(/^Клиент \d\d$/).length;
    expect(rows()).toBe(10);
    expect(screen.getByText("10 од 25")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Прикажи уште 10/ }));
    expect(rows()).toBe(20);
    await userEvent.click(screen.getByRole("button", { name: /Прикажи уште 5/ }));
    expect(rows()).toBe(25);
    expect(screen.queryByRole("button", { name: /Прикажи уште/ })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox", { name: "Пребарај клиент" }), "Клиент");
    expect(rows()).toBe(10);
  });
});
