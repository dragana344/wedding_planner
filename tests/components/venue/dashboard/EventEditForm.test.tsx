import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { EventEditForm } from "@/components/venue/dashboard/EventEditForm";
import { Modal } from "@/components/venue/dashboard/Modal";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// EventEditForm is reached from the events list for any staff member,
// elevated or not — most of these tests exercise actual editing, so they
// pre-seed an elevated manager (final review finding: the form used to stay
// fully editable either way, only learning it lacked permission from a 403
// at submit). The "not elevated" case gets its own dedicated test below.
const elevatedManagerValue = {
  managerName: "Марко",
  isOwner: false,
  token: "test-manager-token",
  elevate: async () => ({ ok: true as const }),
  deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {},
};
function ManagerElevationProvider({ children }: { children: React.ReactNode }) {
  return <ManagerElevationContext.Provider value={elevatedManagerValue}>{children}</ManagerElevationContext.Provider>;
}
import * as eventsClient from "@/lib/venue/events-client";
import * as showcase from "@/lib/venue/showcase";
import * as credentials from "@/lib/venue/credentials";
import * as menuNumbersClient from "@/lib/venue/menu-numbers-client";
import * as menuUsageClient from "@/lib/venue/menu-usage-client";
import * as menusLib from "@/lib/venue/menus";
import * as customMenuClient from "@/lib/venue/custom-menu-client";
import * as changesClient from "@/lib/venue/changes-client";
import type { EventDetail } from "@/lib/venue/events";

const baseEvent: EventDetail = {
  id: "e1",
  couple_names: "Ana & Marko",
  event_date: "2026-09-12",
  start_time: "19:00",
  end_time: "23:00",
  status: "confirmed",
  event_type: "wedding",
  guest_count_estimate: 150,
  created_at: "2026-01-01T10:00:00Z",
  menus: [],
  room_ids: [],
  hasShowcasePhotos: false,
  seatedCount: 120,
  contact_email: null,
  contact_email_2: null,
  contact_phone: null,
  total_price: null,
  deposit_paid: null,
  hasUnseenSeatingChange: false,
  unseenSections: [],
  menuNumbers: { latest: null, previous: null },
};

function mockSupportingCalls() {
  vi.spyOn(showcase, "listShowcasePhotos").mockResolvedValue([]);
  vi.spyOn(credentials, "getEventUsername").mockResolvedValue("ana-marko");
  vi.spyOn(customMenuClient, "fetchCustomMenuEnabled").mockResolvedValue(true);
}

function renderForm(props: Partial<React.ComponentProps<typeof EventEditForm>> & Pick<React.ComponentProps<typeof EventEditForm>, "event" | "onClose" | "onChanged">) {
  return render(
    <ManagerElevationProvider>
      <EventEditForm venueId="v1" rooms={[]} menuTemplates={[]} {...props} />
    </ManagerElevationProvider>
  );
}

describe("EventEditForm", () => {
  it("renders the form fields (no more nested trigger button) pre-filled with the event's data", async () => {
    mockSupportingCalls();
    renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {} });
    expect(screen.getByDisplayValue("Ana & Marko")).toBeInTheDocument();
    expect(screen.getByDisplayValue("150")).toBeInTheDocument();
    expect(await screen.findByText("ana-marko")).toBeInTheDocument();
    // The old design rendered an inner clickable summary row before the real
    // form appeared — that whole extra layer is gone now.
    expect(screen.queryByText("120/150 seated")).not.toBeInTheDocument();
    // Regression guard for the erase-gating fix below: an elevated manager
    // must still actually see the button, not just plain staff losing it.
    expect(screen.getByRole("button", { name: /избриши ги личните податоци/i })).toBeInTheDocument();
  });

  it("saves changes via updateEventViaApi and calls onChanged/onClose", async () => {
    mockSupportingCalls();
    const updateSpy = vi.spyOn(eventsClient, "updateEventViaApi").mockResolvedValue();
    const onClose = vi.fn();
    const onChanged = vi.fn();
    renderForm({ event: baseEvent, onClose, onChanged });
    fireEvent.change(screen.getByDisplayValue("150"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: /зачувај промени/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0][0]).toBe("e1");
    expect(updateSpy.mock.calls[0][1].guest_count_estimate).toBe(180);
    expect(updateSpy.mock.calls[0][2]).toBe("test-manager-token");
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  const tplA = { id: "ma", venue_id: "v1", name: "Класично", description: null, items: [{ id: "i1", name: "Супа", course: "starter", photo_path: null }] };
  const tplB = { id: "mb", venue_id: "v1", name: "Посно", description: null, items: [] };
  const withMenus = { ...baseEvent, menus: [
    { id: "ma", name: "Класично", isCustom: false, items: [] },
    { id: "c1", name: "Сопствено мени", isCustom: true, items: [] },
  ] };

  it("shows every menu as a chip with Погледни мени", async () => {
    mockSupportingCalls();
    renderForm({ event: withMenus, menuTemplates: [tplA, tplB] as never, onClose: () => {}, onChanged: () => {} });
    expect(screen.getByRole("button", { name: "Класично" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Посно" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Сопствено мени" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /погледни мени/i })).toHaveLength(2);
    // The menu's name is visible on the button, not only in its accessible name.
    expect(screen.getByText("Погледни мени: Класично")).toBeInTheDocument();
    expect(screen.getByText("Погледни мени: Сопствено мени")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Погледни мени: Класично" }));
    expect(await screen.findByText("Супа")).toBeInTheDocument();
  });

  it("a manager adds and removes menus and saves the added/removed menu ids", async () => {
    mockSupportingCalls();
    vi.spyOn(menuUsageClient, "fetchMenuUsage").mockResolvedValue({ ma: 0 });
    const updateSpy = vi.spyOn(eventsClient, "updateEventViaApi").mockResolvedValue();
    renderForm({ event: withMenus, menuTemplates: [tplA, tplB] as never, onClose: () => {}, onChanged: () => {} });
    fireEvent.click(screen.getByRole("button", { name: "Посно" }));
    fireEvent.click(screen.getByRole("button", { name: "Класично" }));
    fireEvent.click(screen.getByRole("button", { name: /зачувај промени/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0][1].added_menu_ids).toEqual(["mb"]);
    expect(updateSpy.mock.calls[0][1].removed_menu_ids).toEqual(["ma"]);
  });

  it("removing a menu guests chose warns \"3 гости го избрале ова мени — нивниот избор ќе се избрише\"", async () => {
    mockSupportingCalls();
    const usageSpy = vi.spyOn(menuUsageClient, "fetchMenuUsage").mockResolvedValue({ ma: 3, c1: 0 });
    renderForm({ event: withMenus, menuTemplates: [tplA, tplB] as never, onClose: () => {}, onChanged: () => {} });
    expect(screen.queryByText(/гости го избрале/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Класично" }));
    expect(await screen.findByText("Класично: 3 гости го избрале ова мени — нивниот избор ќе се избрише")).toBeInTheDocument();
    expect(usageSpy).toHaveBeenCalledWith("e1", "test-manager-token");
    // Re-adding clears the warning; removing again does not refetch.
    fireEvent.click(screen.getByRole("button", { name: "Класично" }));
    expect(screen.queryByText(/гости го избрале/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Класично" }));
    expect(await screen.findByText(/3 гости/)).toBeInTheDocument();
    expect(usageSpy).toHaveBeenCalledTimes(1);
  });

  it("plain staff see menus read-only", async () => {
    mockSupportingCalls();
    render(
      <ManagerElevationContext.Provider value={{ ...elevatedManagerValue, managerName: null, token: null }}>
        <EventEditForm venueId="v1" rooms={[]} menuTemplates={[tplA, tplB] as never} event={withMenus} onClose={() => {}} onChanged={() => {}} />
      </ManagerElevationContext.Provider>
    );
    expect(screen.getByRole("button", { name: "Класично" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Посно" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Погледни мени: Класично" }));
    expect(await screen.findByText("Супа")).toBeInTheDocument();
  });

  it("labels a custom menu selection and reveals its dishes behind Погледни мени", async () => {
    mockSupportingCalls();
    const eventWithCustomMenu = {
      ...baseEvent,
      menus: [{
        id: "c1", name: "Сопствено мени", isCustom: true,
        items: [
          { id: "m1", name: "Roast Chicken", course: "main", photo_path: null },
          { id: "m2", name: "Birthday Cake", course: "dessert", photo_path: null },
        ],
      }],
    };
    renderForm({ event: eventWithCustomMenu, onClose: () => {}, onChanged: () => {} });
    expect(await screen.findByRole("button", { name: "Сопствено мени" })).toBeInTheDocument();
    expect(screen.queryByText("Roast Chicken")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /погледни мени/i }));
    expect(await screen.findByText("Roast Chicken")).toBeInTheDocument();
    expect(screen.getByText("Birthday Cake")).toBeInTheDocument();
  });

  it("shows Без мени and no view button when there is no menu selection", async () => {
    mockSupportingCalls();
    renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {} });
    expect(await screen.findByText("Без мени")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /погледни мени/i })).not.toBeInTheDocument();
  });

  it("requires a second click to confirm deletion", async () => {
    mockSupportingCalls();
    const deleteSpy = vi.spyOn(eventsClient, "deleteEventViaApi").mockResolvedValue();
    renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {} });
    fireEvent.click(screen.getByRole("button", { name: /избриши настан/i }));
    expect(deleteSpy).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /да, избриши/i }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("e1", "test-manager-token"));
  });

  it("keeps the couple's email and phone required when editing contacts (A21)", async () => {
    mockSupportingCalls();
    const contactSpy = vi.spyOn(eventsClient, "updateEventContactInfoViaApi").mockResolvedValue();
    renderForm({
      event: { ...baseEvent, contact_email: "ana@example.mk", contact_phone: "070123456" },
      onClose: () => {},
      onChanged: () => {},
    });
    expect(screen.getByLabelText("Email на парот")).toBeRequired();
    fireEvent.change(screen.getByLabelText("Телефон на парот"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: /зачувај контакт/i }).closest("form")!);

    expect(await screen.findByText("Внесете телефон на парот.")).toBeInTheDocument();
    expect(contactSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Телефон на парот"), { target: { value: "070 999 888" } });
    fireEvent.submit(screen.getByRole("button", { name: /зачувај контакт/i }).closest("form")!);
    await waitFor(() =>
      expect(contactSpy).toHaveBeenCalledWith("e1", { contact_email: "ana@example.mk", contact_email_2: null, contact_phone: "070 999 888" }, "test-manager-token"),
    );
  });

  it("disables every write action for a plain staff member who is not elevated (final review finding)", async () => {
    mockSupportingCalls();
    render(
      <ManagerElevationContext.Provider value={{ managerName: null, isOwner: false, token: null, elevate: async () => ({ ok: true as const }), deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {} }}>
        <EventEditForm venueId="v1" rooms={[]} menuTemplates={[]} event={baseEvent} onClose={() => {}} onChanged={() => {}} />
      </ManagerElevationContext.Provider>,
    );
    // No save/delete/regenerate/showcase-upload buttons — not just disabled,
    // not rendered at all, so the only feedback isn't a 403 after the fact.
    expect(screen.queryByRole("button", { name: /зачувај промени/i })).not.toBeInTheDocument();
    expect(screen.getByText("Потребна е најава како менаџер за уредување")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /избриши настан/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /генерирај нова лозинка/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Додади фотографија")).not.toBeInTheDocument();
    // Contacts and money aren't even shown to plain staff (0117) — not just disabled.
    expect(screen.queryByLabelText("Email на парот")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Вкупна цена (МКД)")).not.toBeInTheDocument();
    expect(screen.getAllByText("Само за менаџери: најавете се како менаџер за да ги видите.")).toHaveLength(2);
    // Security review minor finding: the erase-personal-data button used to
    // render for anyone, elevated or not — reachable by plain staff, who'd
    // only learn they lacked permission after typing the confirmation and
    // hitting submit (the server already 403s via requireManagerElevation;
    // this is the matching UI-side gate every other mutating section has).
    expect(screen.queryByRole("button", { name: /избриши ги личните податоци/i })).not.toBeInTheDocument();
    expect(screen.getByText(/само менаџер или сопственик може да ги избрише личните податоци/i)).toBeInTheDocument();
  });

  it("waits for a manager's contacts and money to load instead of showing empty fields that a save would write back", () => {
    mockSupportingCalls();
    renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {}, privateLoaded: false });
    expect(screen.queryByLabelText("Email на парот")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /зачувај контакт/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /зачувај финансии/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("Се вчитува...").length).toBeGreaterThanOrEqual(2);
  });

  it("offers a retry when the manager-only details failed to load", () => {
    mockSupportingCalls();
    const retry = vi.fn();
    renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {}, privateLoaded: false, privateFailed: true, onRetryPrivate: retry });
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Податоците не можеа да се вчитаат.");
    fireEvent.click(screen.getAllByRole("button", { name: "Обиди се повторно" })[0]);
    expect(retry).toHaveBeenCalled();
  });

  it("shows a manager the loaded contacts and money", () => {
    mockSupportingCalls();
    renderForm({
      event: { ...baseEvent, contact_email: "ana@example.mk", contact_phone: "070 111 222", total_price: 300000, deposit_paid: 50000 },
      onClose: () => {},
      onChanged: () => {},
    });
    expect(screen.getByLabelText("Email на парот")).toHaveValue("ana@example.mk");
    expect(screen.getByLabelText("Вкупна цена (МКД)")).toHaveValue(300000);
  });

  it("still lets plain staff open a room's seating to look at it, but not change the rooms", async () => {
    mockSupportingCalls();
    const hall = { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 2000, height_cm: 1500 } as React.ComponentProps<typeof EventEditForm>["rooms"][number];
    render(
      <ManagerElevationContext.Provider value={{ managerName: null, isOwner: false, token: null, elevate: async () => ({ ok: true as const }), deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {} }}>
        <EventEditForm venueId="v1" rooms={[hall]} menuTemplates={[]} event={{ ...baseEvent, room_ids: ["r1"] }} onClose={() => {}} onChanged={() => {}} />
      </ManagerElevationContext.Provider>,
    );
    expect(screen.getByLabelText("Голема сала")).toBeDisabled();
    const open = screen.getByRole("button", { name: /отвори седење/i });
    expect(open).toBeEnabled();
  });
});

describe("EventEditForm custom menu", () => {
  const dish = { id: "d1", venue_id: "v1", tiers: [], course: "main" as const, name: "Печено", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null };

  it("offers + Сопствено мени, builds it through the API and refreshes", async () => {
    mockSupportingCalls();
    vi.spyOn(menusLib, "listMenuItems").mockResolvedValue([dish]);
    const save = vi.spyOn(customMenuClient, "saveCustomMenuViaApi").mockResolvedValue({ id: "c1" });
    const onChanged = vi.fn();
    renderForm({ event: baseEvent, onClose: () => {}, onChanged });
    fireEvent.click(screen.getByRole("button", { name: "+ Сопствено мени" }));
    fireEvent.click(await screen.findByTestId("pkg-toggle-d1"));
    expect(screen.queryByRole("button", { name: /избриши пакет/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("e1", { name: "Сопствено мени", itemIds: ["d1"] }, "test-manager-token"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("a just-saved custom menu is kept when the event form is saved before the refresh lands", async () => {
    mockSupportingCalls();
    vi.spyOn(menusLib, "listMenuItems").mockResolvedValue([dish]);
    vi.spyOn(customMenuClient, "saveCustomMenuViaApi").mockResolvedValue({ id: "c9" });
    const updateSpy = vi.spyOn(eventsClient, "updateEventViaApi").mockResolvedValue();
    renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {} });
    fireEvent.click(screen.getByRole("button", { name: "+ Сопствено мени" }));
    fireEvent.click(await screen.findByTestId("pkg-toggle-d1"));
    fireEvent.click(screen.getByRole("button", { name: "Зачувај мени" }));
    await waitFor(() => expect(screen.queryByTestId("pkg-toggle-d1")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /зачувај промени/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls.at(-1)![1].added_menu_ids).toEqual([]);
    expect(updateSpy.mock.calls.at(-1)![1].removed_menu_ids).toEqual([]);
  });

  it("a manager can take the custom menu off the event, with the guests' warning", async () => {
    mockSupportingCalls();
    vi.spyOn(menuUsageClient, "fetchMenuUsage").mockResolvedValue({ c1: 2 });
    const updateSpy = vi.spyOn(eventsClient, "updateEventViaApi").mockResolvedValue();
    const withCustom = { ...baseEvent, menus: [{ id: "c1", name: "Мое мени", isCustom: true, items: [] }] };
    renderForm({ event: withCustom, onClose: () => {}, onChanged: () => {} });
    const chip = screen.getByRole("button", { name: "Мое мени" });
    expect(chip).toBeEnabled();
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText("Мое мени: 2 гости го избрале ова мени — нивниот избор ќе се избрише")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /зачувај промени/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls.at(-1)![1].added_menu_ids).toEqual([]);
    expect(updateSpy.mock.calls.at(-1)![1].removed_menu_ids).toEqual(["c1"]);
  });

  it("shows the locked hint instead of the custom-menu button when the plan lacks it", async () => {
    mockSupportingCalls();
    const enabledSpy = vi.spyOn(customMenuClient, "fetchCustomMenuEnabled").mockResolvedValue(false);
    renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {} });
    expect(await screen.findByText("Оваа функција не е вклучена во вашиот пакет.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Сопствено мени" })).not.toBeInTheDocument();
    expect(enabledSpy).toHaveBeenCalledWith("e1", "test-manager-token");
  });

  it("keeps the custom-menu button when the plan includes it, and never asks for plain staff", async () => {
    mockSupportingCalls();
    const enabledSpy = vi.spyOn(customMenuClient, "fetchCustomMenuEnabled").mockResolvedValue(true);
    const { unmount } = renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {} });
    await waitFor(() => expect(enabledSpy).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "+ Сопствено мени" })).toBeInTheDocument();
    expect(screen.queryByText("Оваа функција не е вклучена во вашиот пакет.")).not.toBeInTheDocument();
    unmount();
    enabledSpy.mockClear();
    render(
      <ManagerElevationContext.Provider value={{ ...elevatedManagerValue, managerName: null, token: null }}>
        <EventEditForm venueId="v1" rooms={[]} menuTemplates={[]} event={baseEvent} onClose={() => {}} onChanged={() => {}} />
      </ManagerElevationContext.Provider>
    );
    expect(enabledSpy).not.toHaveBeenCalled();
  });

  it("says Уреди сопствено мени when the event has one, and hides it for past events", async () => {
    mockSupportingCalls();
    const withCustom = { ...baseEvent, menus: [{ id: "c1", name: "Мое", isCustom: true, items: [] }] };
    const { unmount } = renderForm({ event: withCustom, onClose: () => {}, onChanged: () => {} });
    expect(screen.getByRole("button", { name: "Уреди сопствено мени" })).toBeInTheDocument();
    unmount();
    renderForm({ event: withCustom, readOnly: true, onClose: () => {}, onChanged: () => {} });
    expect(screen.queryByRole("button", { name: /сопствено мени/i })).not.toBeInTheDocument();
  });

  it("one Escape closes only the builder, not the event form", async () => {
    mockSupportingCalls();
    vi.spyOn(menusLib, "listMenuItems").mockResolvedValue([dish]);
    const outerClose = vi.fn();
    render(
      <ManagerElevationProvider>
        <Modal title="Настан" onClose={outerClose} hideHeader>
          <EventEditForm venueId="v1" rooms={[]} menuTemplates={[]} event={baseEvent} onClose={outerClose} onChanged={() => {}} />
        </Modal>
      </ManagerElevationProvider>
    );
    fireEvent.change(screen.getByDisplayValue("Ana & Marko"), { target: { value: "Нови имиња" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Сопствено мени" }));
    await screen.findByTestId("pkg-toggle-d1");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("pkg-toggle-d1")).not.toBeInTheDocument();
    expect(outerClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Нови имиња")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(outerClose).toHaveBeenCalledTimes(1);
  });

  describe("Бројки за мени", () => {
    const sub = (id: string, sentAt: string, menus: [string, string, number][], seenAt: string | null = null) => ({
      id, sentAt, sentBy: "Младенците",
      numbers: { menus: menus.map(([i, name, count]) => ({ id: i, name, count })), total: menus.reduce((s, m) => s + m[2], 0) },
      seenAt, seenBy: seenAt ? "Марко" : null, source: "couple" as const, unanswered: null,
    });
    const previous = sub("s1", "2026-06-10T10:00:00Z", [["a", "Класично", 180], ["b", "Посно", 22]], "2026-06-11T10:00:00Z");
    const latest = sub("s2", "2026-06-14T10:00:00Z", [["a", "Класично", 180], ["b", "Посно", 23]]);

    it("before any sending: Парот сè уште не ги испратил бројките.", () => {
      mockSupportingCalls();
      renderForm({ event: baseEvent, onClose: () => {}, onChanged: () => {} });
      expect(screen.getByText("Бројки за мени")).toBeInTheDocument();
      expect(screen.getByText("Парот сè уште не ги испратил бројките.")).toBeInTheDocument();
    });

    it("shows per-menu numbers, total and Испратено на 14.06", () => {
      mockSupportingCalls();
      renderForm({ event: { ...baseEvent, menuNumbers: { latest: { ...latest, seenAt: "2026-06-15T10:00:00Z" }, previous } }, onClose: () => {}, onChanged: () => {} });
      expect(screen.getByText("Класично — 180")).toBeInTheDocument();
      expect(screen.getByText("Посно — 23")).toBeInTheDocument();
      expect(screen.getByText("Вкупно — 203")).toBeInTheDocument();
      expect(screen.getByText("Испратено на 14.06.2026 од Младенците")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Видено" })).not.toBeInTheDocument();
    });

    it("an unseen newer sending is highlighted with Посно: 22 → 23 and Видено, which clears via onChanged", async () => {
      mockSupportingCalls();
      const seenSpy = vi.spyOn(menuNumbersClient, "markMenuNumbersSeenViaApi").mockResolvedValue();
      const onChanged = vi.fn();
      renderForm({ event: { ...baseEvent, menuNumbers: { latest, previous } }, onClose: () => {}, onChanged });
      expect(screen.getByText("Посно: 22 → 23")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Видено" }));
      await waitFor(() => expect(seenSpy).toHaveBeenCalledWith("e1", "s2", "test-manager-token"));
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
    });

    it("a 409 (newer numbers arrived) shows the message and reloads", async () => {
      mockSupportingCalls();
      vi.spyOn(menuNumbersClient, "markMenuNumbersSeenViaApi").mockRejectedValue(new menuNumbersClient.NewerMenuNumbersError("Парот испрати нови бројки — освежете."));
      const onChanged = vi.fn();
      renderForm({ event: { ...baseEvent, menuNumbers: { latest, previous } }, onClose: () => {}, onChanged });
      fireEvent.click(screen.getByRole("button", { name: "Видено" }));
      expect(await screen.findByText("Парот испрати нови бројки — освежете.")).toBeInTheDocument();
      expect(onChanged).toHaveBeenCalled();
    });

    it("plain staff see the highlight but no Видено button", () => {
      mockSupportingCalls();
      render(
        <ManagerElevationContext.Provider value={{ ...elevatedManagerValue, managerName: null, token: null } as never}>
          <EventEditForm venueId="v1" rooms={[]} menuTemplates={[]} event={{ ...baseEvent, menuNumbers: { latest, previous } }} onClose={() => {}} onChanged={() => {}} />
        </ManagerElevationContext.Provider>
      );
      expect(screen.getByText("Посно: 22 → 23")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Видено" })).not.toBeInTheDocument();
    });
  });
});

describe("EventEditForm change boxes", () => {
  const futureEvent: EventDetail = { ...baseEvent, event_date: "2999-09-12" };
  const guestChange = {
    id: "c1", eventId: "e1", section: "guest_count" as const, side: "couple" as const, changedBy: null, field: "count",
    oldValue: { count: 100 }, newValue: { count: 150 }, changedAt: "2026-10-30T10:00:00+00:00",
  };

  it("shows the couple's unseen guest-count change above the field", async () => {
    mockSupportingCalls();
    vi.spyOn(changesClient, "fetchEventChanges").mockResolvedValue({ changes: [guestChange], seen: {}, lastReminderAt: null });
    renderForm({ event: futureEvent, onClose: () => {}, onChanged: () => {} });
    expect(await screen.findByText(/Младенците · 30\.10\.2026 11:00 · 100 → 150/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Видено" })).toBeInTheDocument();
  });

  it("Видено refreshes the server data too, so the Настани badge updates", async () => {
    mockSupportingCalls();
    vi.spyOn(changesClient, "fetchEventChanges").mockResolvedValue({ changes: [guestChange], seen: {}, lastReminderAt: null });
    const seen = vi.spyOn(changesClient, "markChangesSeenViaApi").mockResolvedValue({ newer: false });
    router.refresh.mockClear();
    const onChanged = vi.fn();
    renderForm({ event: futureEvent, onClose: () => {}, onChanged });
    fireEvent.click(await screen.findByRole("button", { name: "Видено" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(seen).toHaveBeenCalledWith("e1", "guest_count", guestChange.changedAt, "test-manager-token");
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows no box for a change already seen", async () => {
    mockSupportingCalls();
    const spy = vi.spyOn(changesClient, "fetchEventChanges").mockResolvedValue({ changes: [guestChange], seen: { guest_count: "2026-10-30T10:00:00+00:00" }, lastReminderAt: null });
    renderForm({ event: futureEvent, onClose: () => {}, onChanged: () => {} });
    await waitFor(() => expect(spy).toHaveBeenCalledWith("e1", "test-manager-token"));
    expect(screen.queryByText("Променето")).not.toBeInTheDocument();
  });

  it("renders no box and does not crash when the changes cannot be loaded", async () => {
    mockSupportingCalls();
    const spy = vi.spyOn(changesClient, "fetchEventChanges").mockRejectedValue(new Error("x"));
    renderForm({ event: futureEvent, onClose: () => {}, onChanged: () => {} });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByText("Променето")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Ana & Marko")).toBeInTheDocument();
  });
});

describe("EventEditForm: numbers not sent yet", () => {
  // 18 days out, created long ago: the venue's warning shows.
  const d = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 18);
  const soon: EventDetail = { ...baseEvent, event_date: d.toISOString().slice(0, 10), contact_phone: "070111222" };

  it("shows a manager the couple's phone next to the warning", async () => {
    mockSupportingCalls();
    vi.spyOn(changesClient, "fetchEventChanges").mockResolvedValue({ changes: [], seen: {}, lastReminderAt: null });
    renderForm({ event: soon, onClose: () => {}, onChanged: () => {} });
    const warning = screen.getByText("Бројките уште не се испратени").closest("[role=status]") as HTMLElement;
    expect(within(warning).getByText(/070111222/)).toBeInTheDocument();
  });

  it("never shows plain staff the phone", async () => {
    mockSupportingCalls();
    vi.spyOn(changesClient, "fetchEventChanges").mockResolvedValue({ changes: [], seen: {}, lastReminderAt: null });
    render(
      <ManagerElevationContext.Provider value={{ ...elevatedManagerValue, managerName: null, token: null }}>
        <EventEditForm venueId="v1" rooms={[]} menuTemplates={[]} event={soon} onClose={() => {}} onChanged={() => {}} />
      </ManagerElevationContext.Provider>,
    );
    expect(screen.getByText("Бројките уште не се испратени")).toBeInTheDocument();
    expect(screen.queryByText(/070111222/)).not.toBeInTheDocument();
  });
});
