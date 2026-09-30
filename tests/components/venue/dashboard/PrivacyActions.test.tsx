import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { EventDetail } from "@/lib/venue/events";

// DATA-006: destructive privacy actions stay disabled until the exact name is
// typed, and only then call their API route.

const mockPush = vi.fn();
const mockSignOut = vi.fn(async () => ({ error: null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: () => ({ auth: { signOut: mockSignOut } }),
}));
vi.mock("@/lib/venue/showcase", () => ({
  listShowcasePhotos: vi.fn(async () => []),
  addShowcasePhoto: vi.fn(),
  deleteShowcasePhoto: vi.fn(),
  getShowcasePhotoUrl: vi.fn(() => ""),
}));
vi.mock("@/lib/venue/credentials", () => ({
  getEventUsername: vi.fn(async () => "ana-marko"),
  regenerateEventPassword: vi.fn(),
  generateRandomPassword: vi.fn(() => "x"),
}));

import { SettingsClient } from "@/components/venue/dashboard/SettingsClient";
import { EventEditForm } from "@/components/venue/dashboard/EventEditForm";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
  mockSignOut.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const event: EventDetail = {
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
  seatedCount: 0,
  contact_email: "ana@example.com",
  contact_email_2: null,
  contact_phone: null,
  total_price: null,
  deposit_paid: null,
};

describe("Settings: delete account (DATA-006)", () => {
  function renderSettings() {
    render(<SettingsClient venueId="v1" venueName="Sala Biser" email="owner@example.com" />);
    return {
      input: screen.getByLabelText(/внесете го името на локалот/i),
      button: screen.getByRole("button", { name: /Избриши ја сметката/ }),
    };
  }

  it("keeps the delete button disabled until the venue name is typed exactly", () => {
    const { input, button } = renderSettings();
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "sala biser" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "Sala Bise" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "Sala Biser" } });
    expect(button).toBeEnabled();
    fireEvent.submit(button.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the API when submitted without a matching name", () => {
    const { input, button } = renderSettings();
    fireEvent.change(input, { target: { value: "Other" } });
    fireEvent.submit(button.closest("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes, signs out and goes to /login", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { input, button } = renderSettings();
    fireEvent.change(input, { target: { value: "  Sala Biser " } });
    fireEvent.click(button);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/venue/privacy/delete-account",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ confirm: "  Sala Biser " }) }),
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("shows the server's error and stays on the page when deletion fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Потврдата не се совпаѓа" }), { status: 400 }));
    const { input, button } = renderSettings();
    fireEvent.change(input, { target: { value: "Sala Biser" } });
    fireEvent.click(button);
    expect(await screen.findByText("Потврдата не се совпаѓа")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("offers a data download", () => {
    renderSettings();
    expect(screen.getByRole("button", { name: "Преземи ги податоците" })).toBeEnabled();
  });
});

describe("Event form: erase personal data (DATA-006)", () => {
  function renderForm(onChanged = vi.fn(), onClose = vi.fn()) {
    render(<EventEditForm event={event} venueId="v1" rooms={[]} menuTemplates={[]} onClose={onClose} onChanged={onChanged} readOnly />);
    fireEvent.click(screen.getByRole("button", { name: "Избриши ги личните податоци за овој настан" }));
    return {
      input: screen.getByLabelText(/За потврда, внесете/),
      button: screen.getByRole("button", { name: "Трајно избриши" }),
      onChanged,
      onClose,
    };
  }

  it("is available on read-only (past) events and gated by the couple's names", () => {
    const { input, button } = renderForm();
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "Ana" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "Ana & Marko" } });
    expect(button).toBeEnabled();
  });

  it("calls the erase route with the event id and typed confirmation", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { input, button, onChanged, onClose } = renderForm();
    fireEvent.change(input, { target: { value: "Ana & Marko" } });
    fireEvent.click(button);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/venue/privacy/erase-event",
      expect.objectContaining({ body: JSON.stringify({ event_id: "e1", confirm: "Ana & Marko" }) }),
    );
  });
});
