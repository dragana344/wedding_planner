import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ManagerElevationProvider, useManagerElevation, reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

function Probe() {
  const { managerName, elevate, deAuthorize } = useManagerElevation();
  return (
    <div>
      <p data-testid="status">{managerName ?? "staff"}</p>
      <button onClick={() => elevate("Марко", "pw-1")}>elevate</button>
      <button onClick={deAuthorize}>deauthorize</button>
    </div>
  );
}

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("ManagerElevationContext", () => {
  it("starts as plain staff (not elevated)", () => {
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    expect(screen.getByTestId("status")).toHaveTextContent("staff");
  });

  it("elevates on success and reflects the manager's name", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко" }) });
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("elevate"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("Марко"));
  });

  it("exposes isOwner from the elevation response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко", isOwner: true }) });
    function OwnerProbe() {
      const { isOwner, elevate } = useManagerElevation();
      return (
        <div>
          <p data-testid="owner">{String(isOwner)}</p>
          <button onClick={() => elevate("Марко", "pw-1")}>elevate</button>
        </div>
      );
    }
    render(<ManagerElevationProvider><OwnerProbe /></ManagerElevationProvider>);
    expect(screen.getByTestId("owner")).toHaveTextContent("false");
    fireEvent.click(screen.getByText("elevate"));
    await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("true"));
  });

  it("stays staff and surfaces the error on a failed elevation", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Неточно име или лозинка." }) });
    let captured: { ok: true } | { ok: false; error: string } | undefined;
    function CaptureProbe() {
      const { elevate } = useManagerElevation();
      return <button onClick={async () => { captured = await elevate("Марко", "wrong"); }}>go</button>;
    }
    render(<ManagerElevationProvider><CaptureProbe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(captured).toEqual({ ok: false, error: "Неточно име или лозинка." }));
  });

  it("returns a friendly error instead of throwing when fetch itself rejects (offline/network failure)", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    let captured: { ok: true } | { ok: false; error: string } | undefined;
    function CaptureProbe() {
      const { elevate } = useManagerElevation();
      return <button onClick={async () => { captured = await elevate("Марко", "pw-1"); }}>go</button>;
    }
    render(<ManagerElevationProvider><CaptureProbe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("go"));
    await waitFor(() => expect(captured?.ok).toBe(false));
    expect((captured as { ok: false; error: string }).error).toBeTruthy();
  });

  it("deAuthorize clears the elevated state and calls the deauthorize endpoint", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("elevate"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("Марко"));

    fireEvent.click(screen.getByText("deauthorize"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("staff"));
    expect(mockFetch).toHaveBeenCalledWith("/api/venue/managers/deauthorize", expect.objectContaining({ method: "POST" }));
  });

  it("carries passwordResetNoticeAt from elevation, and dismissing clears it and notifies the server (security review #4)", async () => {
    const noticeAt = new Date(Date.now() - 60_000).toISOString();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко", passwordResetNoticeAt: noticeAt }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    function NoticeProbe() {
      const { passwordResetNoticeAt, elevate, dismissPasswordResetNotice } = useManagerElevation();
      return (
        <div>
          <p data-testid="notice">{passwordResetNoticeAt ?? "none"}</p>
          <button onClick={() => elevate("Марко", "pw-1")}>elevate</button>
          <button onClick={() => dismissPasswordResetNotice()}>dismiss</button>
        </div>
      );
    }
    render(<ManagerElevationProvider><NoticeProbe /></ManagerElevationProvider>);
    expect(screen.getByTestId("notice")).toHaveTextContent("none");

    fireEvent.click(screen.getByText("elevate"));
    await waitFor(() => expect(screen.getByTestId("notice")).toHaveTextContent(noticeAt));

    fireEvent.click(screen.getByText("dismiss"));
    await waitFor(() => expect(screen.getByTestId("notice")).toHaveTextContent("none"));
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/venue/managers/password-reset-notice/dismiss",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "abc123" }) })
    );
  });

  it("drops back to plain staff on its own once expiresAt passes, without waiting for a gated action to 403 (final review finding)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 5000).toISOString(), managerName: "Марко" }) });
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    await act(async () => fireEvent.click(screen.getByText("elevate")));
    expect(screen.getByTestId("status")).toHaveTextContent("Марко");

    await act(async () => vi.advanceTimersByTime(5001));
    expect(screen.getByTestId("status")).toHaveTextContent("staff");
    vi.useRealTimers();
  });

  it("drops back to plain staff when any gated fetch reports a 403, not just its own elevate/deAuthorize calls (final review finding)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ token: "abc123", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко" }) });
    render(<ManagerElevationProvider><Probe /></ManagerElevationProvider>);
    fireEvent.click(screen.getByText("elevate"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("Марко"));

    // Simulates what lib/venue/events-client.ts and every other gated fetch
    // call site do on a 403 — reported through the module-level hook since
    // they have no React access to this provider's own deAuthorize.
    act(() => reportElevationRejected());
    expect(screen.getByTestId("status")).toHaveTextContent("staff");
  });
});
