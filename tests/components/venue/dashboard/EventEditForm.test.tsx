import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventEditForm } from "@/components/venue/dashboard/EventEditForm";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";

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
  menu_template_id: null,
  customMenuItems: [],
  room_ids: [],
  hasShowcasePhotos: false,
  seatedCount: 120,
  contact_email: null,
  contact_email_2: null,
  contact_phone: null,
  total_price: null,
  deposit_paid: null,
  hasUnseenSeatingChange: false,
};

function mockSupportingCalls() {
  vi.spyOn(showcase, "listShowcasePhotos").mockResolvedValue([]);
  vi.spyOn(credentials, "getEventUsername").mockResolvedValue("ana-marko");
}

function renderForm(props: Partial<React.ComponentProps<typeof EventEditForm>> & Pick<React.ComponentProps<typeof EventEditForm>, "event" | "onClose" | "onChanged">) {
  return render(
    <ManagerElevationProvider>
      <EventEditForm rooms={[]} menuTemplates={[]} {...props} />
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

  it("labels a custom menu selection and reveals its dishes behind Погледни мени", async () => {
    mockSupportingCalls();
    const eventWithCustomMenu = {
      ...baseEvent,
      customMenuItems: [
        { id: "m1", name: "Roast Chicken", course: "main", photo_path: null },
        { id: "m2", name: "Birthday Cake", course: "dessert", photo_path: null },
      ],
    };
    renderForm({ event: eventWithCustomMenu, onClose: () => {}, onChanged: () => {} });
    expect(await screen.findByText("Сопствено мени")).toBeInTheDocument();
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
        <EventEditForm rooms={[]} menuTemplates={[]} event={baseEvent} onClose={() => {}} onChanged={() => {}} />
      </ManagerElevationContext.Provider>,
    );
    // No save/delete/regenerate/showcase-upload buttons — not just disabled,
    // not rendered at all, so the only feedback isn't a 403 after the fact.
    expect(screen.queryByRole("button", { name: /зачувај промени/i })).not.toBeInTheDocument();
    expect(screen.getByText("Потребна е најава како менаџер за уредување")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /избриши настан/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /генерирај нова лозинка/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Додади фотографија")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email на парот")).toBeDisabled();
    // Security review minor finding: the erase-personal-data button used to
    // render for anyone, elevated or not — reachable by plain staff, who'd
    // only learn they lacked permission after typing the confirmation and
    // hitting submit (the server already 403s via requireManagerElevation;
    // this is the matching UI-side gate every other mutating section has).
    expect(screen.queryByRole("button", { name: /избриши ги личните податоци/i })).not.toBeInTheDocument();
    expect(screen.getByText(/само менаџер или сопственик може да ги избрише личните податоци/i)).toBeInTheDocument();
  });

  it("still lets plain staff open a room's seating to look at it, but not change the rooms", async () => {
    mockSupportingCalls();
    const hall = { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 2000, height_cm: 1500 } as React.ComponentProps<typeof EventEditForm>["rooms"][number];
    render(
      <ManagerElevationContext.Provider value={{ managerName: null, isOwner: false, token: null, elevate: async () => ({ ok: true as const }), deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {} }}>
        <EventEditForm rooms={[hall]} menuTemplates={[]} event={{ ...baseEvent, room_ids: ["r1"] }} onClose={() => {}} onChanged={() => {}} />
      </ManagerElevationContext.Provider>,
    );
    expect(screen.getByLabelText("Голема сала")).toBeDisabled();
    const open = screen.getByRole("button", { name: /отвори седење/i });
    expect(open).toBeEnabled();
  });
});
