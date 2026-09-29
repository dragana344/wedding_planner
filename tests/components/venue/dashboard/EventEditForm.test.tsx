import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventEditForm } from "@/components/venue/dashboard/EventEditForm";
import * as events from "@/lib/venue/events";
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
};

function mockSupportingCalls() {
  vi.spyOn(showcase, "listShowcasePhotos").mockResolvedValue([]);
  vi.spyOn(credentials, "getEventUsername").mockResolvedValue("ana-marko");
}

describe("EventEditForm", () => {
  it("renders the form fields (no more nested trigger button) pre-filled with the event's data", async () => {
    mockSupportingCalls();
    render(
      <EventEditForm event={baseEvent} venueId="v1" rooms={[]} menuTemplates={[]} onClose={() => {}} onChanged={() => {}} />
    );
    expect(screen.getByDisplayValue("Ana & Marko")).toBeInTheDocument();
    expect(screen.getByDisplayValue("150")).toBeInTheDocument();
    expect(await screen.findByText("ana-marko")).toBeInTheDocument();
    // The old design rendered an inner clickable summary row before the real
    // form appeared — that whole extra layer is gone now.
    expect(screen.queryByText("120/150 seated")).not.toBeInTheDocument();
  });

  it("saves changes via updateEvent and calls onChanged/onClose", async () => {
    mockSupportingCalls();
    const updateSpy = vi.spyOn(events, "updateEvent").mockResolvedValue();
    const onClose = vi.fn();
    const onChanged = vi.fn();
    render(
      <EventEditForm event={baseEvent} venueId="v1" rooms={[]} menuTemplates={[]} onClose={onClose} onChanged={onChanged} />
    );
    fireEvent.change(screen.getByDisplayValue("150"), { target: { value: "180" } });
    fireEvent.click(screen.getByRole("button", { name: /зачувај промени/i }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0][2].guest_count_estimate).toBe(180);
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
    render(
      <EventEditForm event={eventWithCustomMenu} venueId="v1" rooms={[]} menuTemplates={[]} onClose={() => {}} onChanged={() => {}} />
    );
    expect(await screen.findByText("Сопствено мени")).toBeInTheDocument();
    expect(screen.queryByText("Roast Chicken")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /погледни мени/i }));
    expect(await screen.findByText("Roast Chicken")).toBeInTheDocument();
    expect(screen.getByText("Birthday Cake")).toBeInTheDocument();
  });

  it("shows Без мени and no view button when there is no menu selection", async () => {
    mockSupportingCalls();
    render(
      <EventEditForm event={baseEvent} venueId="v1" rooms={[]} menuTemplates={[]} onClose={() => {}} onChanged={() => {}} />
    );
    expect(await screen.findByText("Без мени")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /погледни мени/i })).not.toBeInTheDocument();
  });

  it("requires a second click to confirm deletion", async () => {
    mockSupportingCalls();
    const deleteSpy = vi.spyOn(events, "deleteEvent").mockResolvedValue();
    render(
      <EventEditForm event={baseEvent} venueId="v1" rooms={[]} menuTemplates={[]} onClose={() => {}} onChanged={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /избриши настан/i }));
    expect(deleteSpy).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: /да, избриши/i }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("e1"));
  });

  it("keeps the couple's email and phone required when editing contacts (A21)", async () => {
    mockSupportingCalls();
    const contactSpy = vi.spyOn(events, "updateEventContactInfo").mockResolvedValue();
    render(
      <EventEditForm
        event={{ ...baseEvent, contact_email: "ana@example.mk", contact_phone: "070123456" }}
        venueId="v1"
        rooms={[]}
        menuTemplates={[]}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByLabelText("Email на парот")).toBeRequired();
    fireEvent.change(screen.getByLabelText("Телефон на парот"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: /зачувај контакт/i }).closest("form")!);

    expect(await screen.findByText("Внесете телефон на парот.")).toBeInTheDocument();
    expect(contactSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Телефон на парот"), { target: { value: "070 999 888" } });
    fireEvent.submit(screen.getByRole("button", { name: /зачувај контакт/i }).closest("form")!);
    await waitFor(() =>
      expect(contactSpy).toHaveBeenCalledWith("e1", { contact_email: "ana@example.mk", contact_email_2: null, contact_phone: "070 999 888" }),
    );
  });
});
