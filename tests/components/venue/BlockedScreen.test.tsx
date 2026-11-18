import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BlockedScreen } from "@/components/venue/BlockedScreen";

// 0172: a blocked venue whose deletion is scheduled still sees the date, and
// the owner can download the venue's data with the owner password.

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("BlockedScreen", () => {
  it("without a scheduled deletion: only the block message", () => {
    render(<BlockedScreen reason="неплатено" />);
    expect(screen.getByText("Пристапот е привремено оневозможен.")).toBeInTheDocument();
    expect(screen.getByText("неплатено")).toBeInTheDocument();
    expect(screen.queryByText(/ќе биде избришана/)).toBeNull();
    expect(screen.queryByLabelText("Лозинка на сопственикот")).toBeNull();
  });

  it("with a scheduled deletion: the date (Skopje) and the owner's export", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Неточна лозинка на сопственикот." }), { status: 401 }));
    render(<BlockedScreen reason={null} deletionScheduledFor="2026-12-02T23:30:00Z" hasOwner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Сметката на локалот ќе биде избришана на 03.12.2026.");
    fireEvent.change(screen.getByLabelText("Лозинка на сопственикот"), { target: { value: "сопственик-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Преземи ги податоците" }));
    await waitFor(() => expect(screen.getByText("Неточна лозинка на сопственикот.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/venue/privacy/export", expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "сопственик-1" }) }));
  });

  it("with no owner login: says to contact us instead of offering the export", () => {
    render(<BlockedScreen deletionScheduledFor="2026-12-03T10:00:00Z" hasOwner={false} />);
    expect(screen.getByText(/За преземање на податоците контактирајте нè/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Лозинка на сопственикот")).toBeNull();
  });
});
