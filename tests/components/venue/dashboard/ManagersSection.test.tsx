import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ManagersSection } from "@/components/venue/dashboard/ManagersSection";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

// ManagersSection is reached only from the owner-gated Settings page, so it
// always has an elevated owner token in practice — pre-seed one via the raw
// context the same way tests/components/venue/dashboard/PrivacyActions.test.tsx
// does, rather than driving the real elevate() flow.
const elevatedOwnerValue = {
  managerName: "Власник",
  isOwner: true,
  token: "test-owner-token",
  elevate: async () => ({ ok: true as const }),
  deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {},
};
function ManagerElevationProvider({ children }: { children: React.ReactNode }) {
  return <ManagerElevationContext.Provider value={elevatedOwnerValue}>{children}</ManagerElevationContext.Provider>;
}

describe("ManagersSection", () => {
  it("lists managers and marks the owner", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [{ id: "1", name: "Власник", isOwner: true, createdAt: "2026-01-01" }] }) });
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    expect(await screen.findByText("Власник (сопственик)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отстрани" })).not.toBeInTheDocument();
  });

  it("adds a manager and refreshes the list", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [] }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "2" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [{ id: "2", name: "Нов", isOwner: false, createdAt: "2026-01-02" }] }) });
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Име на нов менаџер"), { target: { value: "Нов" } });
    fireEvent.change(screen.getByLabelText("Лозинка на нов менаџер"), { target: { value: "new-pass-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Додади менаџер" }));
    expect(await screen.findByText("Нов")).toBeInTheDocument();
  });

  it("asks for confirmation before removing a manager, and does nothing when declined (final review finding)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [{ id: "2", name: "Нов", isOwner: false, createdAt: "2026-01-02" }] }) });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Отстрани" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Нов"));
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the initial list load, no DELETE call
  });

  it("surfaces the server's error instead of silently ignoring a failed removal (final review finding)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [{ id: "2", name: "Нов", isOwner: false, createdAt: "2026-01-02" }] }) });
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Менаџерот не е пронајден." }) });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Отстрани" }));
    expect(await screen.findByText("Менаџерот не е пронајден.")).toBeInTheDocument();
  });

  it("shows an error instead of an endless 'Се вчитува...' when the list fails to load (final review finding)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "nope" }) });
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    expect(await screen.findByText("Менаџерите не можеа да се вчитаат.")).toBeInTheDocument();
    expect(screen.queryByText("Се вчитува...")).not.toBeInTheDocument();
  });

  it("explains a failed removal instead of failing silently, and re-enables the button", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [{ id: "2", name: "Ана", isOwner: false, createdAt: "2026-01-02" }] }) });
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Отстрани" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Менаџерот не можеше да се отстрани.");
    expect(screen.getByRole("button", { name: "Отстрани" })).toBeEnabled();
  });

  it("shows a message when adding fails with a non-JSON server error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ managers: [] }) });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new SyntaxError("Unexpected token <"); } });
    render(<ManagerElevationProvider><ManagersSection /></ManagerElevationProvider>);
    fireEvent.change(screen.getByLabelText("Име на нов менаџер"), { target: { value: "Нов" } });
    fireEvent.change(screen.getByLabelText("Лозинка на нов менаџер"), { target: { value: "password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Додади менаџер" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Менаџерот не можеше да се додаде.");
    expect(screen.getByRole("button", { name: "Додади менаџер" })).toBeEnabled();
  });
});
