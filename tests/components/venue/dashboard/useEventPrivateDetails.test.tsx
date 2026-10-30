import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";
import { useEventPrivateDetails } from "@/components/venue/dashboard/useEventPrivateDetails";
import type { EventDetail } from "@/lib/venue/events";

// 0117: Настани gets the couple's contacts and the money only while a
// manager is logged in, and forgets them when that login ends.

const event = { id: "e1", couple_names: "Ана и Марко", contact_email: null, contact_email_2: null, contact_phone: null, total_price: null, deposit_paid: null } as EventDetail;
const details = { id: "e1", contact_email: "ana@example.mk", contact_email_2: null, contact_phone: "070 111 222", total_price: 300000, deposit_paid: 50000 };

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

function wrapperFor(token: string | null) {
  const value = { managerName: token ? "Марко" : null, isOwner: false, token, elevate: async () => ({ ok: true as const }), deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {} };
  return function ElevationWrapper({ children }: { children: React.ReactNode }) {
    return <ManagerElevationContext.Provider value={value}>{children}</ManagerElevationContext.Provider>;
  };
}

describe("useEventPrivateDetails", () => {
  it("asks for nothing without a manager login", () => {
    const { result } = renderHook(() => useEventPrivateDetails(), { wrapper: wrapperFor(null) });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
    expect(result.current.withPrivate(event).contact_email).toBeNull();
  });

  it("loads them for a manager, with the token, and merges them into the event", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ events: [details] }) });
    const { result } = renderHook(() => useEventPrivateDetails(), { wrapper: wrapperFor("tok") });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("/api/venue/events/private", expect.objectContaining({ headers: { "x-venue-manager-token": "tok" } }));
    expect(result.current.withPrivate(event)).toMatchObject({ contact_email: "ana@example.mk", total_price: 300000 });
  });

  it("forgets them when the manager login ends", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ events: [details] }) });
    let token: string | null = "tok";
    const { result, rerender } = renderHook(() => useEventPrivateDetails(), {
      wrapper: function ChangingElevation({ children }) {
        return wrapperFor(token)({ children });
      },
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    token = null;
    rerender();
    await waitFor(() => expect(result.current.loaded).toBe(false));
    expect(result.current.withPrivate(event).contact_email).toBeNull();
  });
});

describe("useEventPrivateDetails — failures", () => {
  it("says it failed (and can retry) instead of loading forever", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useEventPrivateDetails(), { wrapper: wrapperFor("tok") });
    await waitFor(() => expect(result.current.failed).toBe(true));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ events: [details] }) });
    result.current.reload();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.failed).toBe(false);
  });
});
