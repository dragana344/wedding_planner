import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChangeBox } from "@/components/venue/dashboard/ChangeBox";
import * as changesClient from "@/lib/venue/changes-client";
import type { EventChange } from "@/lib/changes/types";

afterEach(() => vi.restoreAllMocks());

const older: EventChange = {
  id: "c1", eventId: "e1", section: "guest_count", side: "couple", changedBy: null, field: "count",
  oldValue: { count: 100 }, newValue: { count: 120 }, changedAt: "2026-10-30T10:05:00.123456+00:00",
};
const newest: EventChange = { ...older, id: "c2", newValue: { count: 130 }, oldValue: { count: 120 }, changedAt: "2026-10-31T09:00:00.654321+00:00", changedBy: "Ко-организатор" };

function renderBox(props: Partial<React.ComponentProps<typeof ChangeBox>> = {}) {
  const onSeen = vi.fn();
  render(<ChangeBox eventId="e1" section="guest_count" changes={[older, newest]} canConfirm token="tok" onSeen={onSeen} {...props} />);
  return onSeen;
}

describe("ChangeBox", () => {
  it("renders the label and one line per change in the Skopje time zone", () => {
    renderBox();
    expect(screen.getByText("Променето")).toBeInTheDocument();
    // 10:05 UTC is 11:05 in Skopje (CET after the October switch is +1; 30 Oct is still CET).
    expect(screen.getByText("Младенците · 30.10.2026 11:05 · 100 → 120")).toBeInTheDocument();
    expect(screen.getByText("Ко-организатор · 31.10.2026 10:00 · 120 → 130")).toBeInTheDocument();
  });

  it("shows Видено only to a manager", () => {
    renderBox({ canConfirm: false });
    expect(screen.queryByRole("button", { name: "Видено" })).not.toBeInTheDocument();
  });

  it("renders nothing without changes", () => {
    const { container } = render(<ChangeBox eventId="e1" section="guest_count" changes={[]} canConfirm token={null} onSeen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("redacts contact values that came back null", () => {
    const contact: EventChange = { ...older, section: "contact", field: "contact", oldValue: null, newValue: null };
    renderBox({ section: "contact", changes: [contact], canConfirm: false });
    expect(screen.getByText(/Контакт е променет/)).toBeInTheDocument();
  });

  it("Видено sends the newest changedAt unchanged, then asks for a refresh", async () => {
    const spy = vi.spyOn(changesClient, "markChangesSeenViaApi").mockResolvedValue({ newer: false });
    const onSeen = renderBox();
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    await waitFor(() => expect(onSeen).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith("e1", "guest_count", "2026-10-31T09:00:00.654321+00:00", "tok");
    expect(screen.queryByText("Има нови промени — освежете.")).not.toBeInTheDocument();
  });

  it("tells the viewer when newer changes arrived meanwhile", async () => {
    vi.spyOn(changesClient, "markChangesSeenViaApi").mockResolvedValue({ newer: true });
    const onSeen = renderBox();
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Има нови промени — освежете.");
    expect(onSeen).toHaveBeenCalled();
  });

  it("shows an API error as an alert", async () => {
    vi.spyOn(changesClient, "markChangesSeenViaApi").mockRejectedValue(new Error("Нема дозвола"));
    const onSeen = renderBox();
    fireEvent.click(screen.getByRole("button", { name: "Видено" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Нема дозвола");
    expect(onSeen).not.toHaveBeenCalled();
  });
});
