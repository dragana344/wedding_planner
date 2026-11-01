import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { EventDetail } from "@/lib/venue/events";

// DATA-006: destructive privacy actions stay disabled until the exact name is
// typed, and only then call their API route.

const mockSignOut = vi.fn(async () => ({ error: null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
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
import { ManagerElevationProvider, ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";

// Settings is owner-gated (Plan 2 Task 4): these tests exercise the
// delete-account flow itself, not the elevation gate, so they pre-seed an
// already-elevated owner state via the raw context rather than going
// through the real elevate() fetch.
const elevatedOwnerValue = {
  managerName: "Власник",
  isOwner: true,
  token: "test-owner-token",
  elevate: async () => ({ ok: true as const }),
  deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {},
};

const fetchMock = vi.fn();

// The delete-account flow navigates to /login with a hard
// `window.location.href` assignment rather than router.push (see the
// comment in SettingsClient.tsx for why) — jsdom's window.location can't be
// reassigned directly, so it's replaced with a stand-in that records it.
let locationHref = "";
beforeEach(() => {
  fetchMock.mockReset();
  mockSignOut.mockClear();
  // Settings is owner-gated and renders ManagersSection, which fires its
  // own GET /api/venue/managers on mount, and now fetches its own venue
  // data from GET /api/venue/settings too — both routed to fixed stubs
  // here so they never touch fetchMock, keeping every existing
  // toHaveBeenCalledWith/toHaveBeenCalledTimes assertion about the
  // delete-account/export/erase calls accurate.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (url === "/api/venue/managers") return Promise.resolve({ ok: true, json: async () => ({ managers: [] }) });
    if (url === "/api/venue/settings" && (!init?.method || init.method === "GET")) {
      return Promise.resolve({ ok: true, json: async () => ({ venueName: "Sala Biser", email: "owner@example.com" }) });
    }
    return fetchMock(url, init);
  });
  locationHref = "";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      get href() {
        return locationHref;
      },
      set href(value: string) {
        locationHref = value;
      },
    },
  });
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
  created_at: "2026-01-01T10:00:00Z",
  menus: [],
  room_ids: [],
  hasShowcasePhotos: false,
  seatedCount: 0,
  contact_email: "ana@example.com",
  contact_email_2: null,
  contact_phone: null,
  total_price: null,
  deposit_paid: null,
  hasUnseenSeatingChange: false,
  unseenSections: [],
  menuNumbers: { latest: null, previous: null },
};

describe("Settings: delete account (DATA-006)", () => {
  async function renderSettings() {
    render(
      <ManagerElevationContext.Provider value={elevatedOwnerValue}>
        <SettingsClient />
      </ManagerElevationContext.Provider>
    );
    return {
      input: await screen.findByLabelText(/внесете го името на локалот/i),
      button: screen.getByRole("button", { name: /Избриши ја сметката/ }),
    };
  }

  it("keeps the delete button disabled until the venue name is typed exactly", async () => {
    const { input, button } = await renderSettings();
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

  it("does not call the API when submitted without a matching name", async () => {
    const { input, button } = await renderSettings();
    fireEvent.change(input, { target: { value: "Other" } });
    fireEvent.submit(button.closest("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes, signs out and goes to /login", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { input, button } = await renderSettings();
    fireEvent.change(input, { target: { value: "  Sala Biser " } });
    fireEvent.click(button);
    await waitFor(() => expect(locationHref).toBe("/login"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/venue/privacy/delete-account",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ confirm: "  Sala Biser " }) }),
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("shows the server's error and stays on the page when deletion fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Потврдата не се совпаѓа" }), { status: 400 }));
    const { input, button } = await renderSettings();
    fireEvent.change(input, { target: { value: "Sala Biser" } });
    fireEvent.click(button);
    expect(await screen.findByText("Потврдата не се совпаѓа")).toBeInTheDocument();
    expect(locationHref).toBe("");
  });

  it("offers a data download", async () => {
    await renderSettings();
    expect(screen.getByRole("button", { name: "Преземи ги податоците" })).toBeEnabled();
  });
});

describe("Event form: erase personal data (DATA-006)", () => {
  // Erase requires manager elevation (security review minor finding — it
  // used to render for any staff member, elevated or not, same class of gap
  // closed elsewhere in this file). It must still work on a read-only (past)
  // event for an elevated manager though — gated on !canEdit specifically,
  // not the combined `locked` flag that also folds in readOnly, matching
  // "Избриши настан" staying available on past events too.
  function renderForm(onChanged = vi.fn(), onClose = vi.fn()) {
    render(
      <ManagerElevationContext.Provider value={elevatedOwnerValue}>
        <EventEditForm venueId="v1" event={event} rooms={[]} menuTemplates={[]} onClose={onClose} onChanged={onChanged} readOnly />
      </ManagerElevationContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Избриши ги личните податоци за овој настан" }));
    return {
      input: screen.getByLabelText(/За потврда, внесете/),
      button: screen.getByRole("button", { name: "Трајно избриши" }),
      onChanged,
      onClose,
    };
  }

  it("is not offered at all to a plain staff member who is not elevated, even if they weren't going to be able to submit it anyway", () => {
    render(
      <ManagerElevationProvider>
        <EventEditForm venueId="v1" event={event} rooms={[]} menuTemplates={[]} onClose={vi.fn()} onChanged={vi.fn()} readOnly />
      </ManagerElevationProvider>,
    );
    expect(screen.queryByRole("button", { name: "Избриши ги личните податоци за овој настан" })).not.toBeInTheDocument();
    expect(screen.getByText(/само менаџер или сопственик може да ги избрише/i)).toBeInTheDocument();
  });

  it("is available on read-only (past) events for an elevated manager, and gated by the couple's names", () => {
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
