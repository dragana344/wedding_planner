import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsClient } from "@/components/venue/dashboard/SettingsClient";
import { ManagerElevationContext, ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("SettingsClient — owner-only gate", () => {
  it("shows an owner-only message instead of the settings content when not elevated as owner", () => {
    render(
      <ManagerElevationProvider>
        <SettingsClient />
      </ManagerElevationProvider>
    );
    expect(screen.getByText("Оваа страница е достапна само за сопственикот.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/внесете го името на локалот/i)).not.toBeInTheDocument();
  });
});

describe("SettingsClient — guests' answer deadline (0180)", () => {
  const owner = {
    managerName: "Сопственик",
    isOwner: true,
    token: "owner-token",
    elevate: async () => ({ ok: true as const }),
    deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {},
  };

  it("loads the venue's days and saves a new number for the owner", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/venue/managers") return { ok: true, json: async () => ({ managers: [] }) };
      if (init?.method === "PATCH") return { ok: true, json: async () => ({ ok: true }) };
      return { ok: true, json: async () => ({ venueName: "Лотос", email: "a@b.mk", coupleSeatingSelfEditEnabled: true, rsvpDeadlineDays: 12 }) };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(
      <ManagerElevationContext.Provider value={owner}>
        <SettingsClient />
      </ManagerElevationContext.Provider>,
    );
    const input = await screen.findByLabelText("Рок за одговор на гостите (дена пред настанот)");
    expect(input).toHaveValue(12);
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getAllByText("Зачувано.").length).toBeGreaterThan(0));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/venue/settings");
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ field: "rsvp_deadline_days", days: 20 });
  });

  it("refuses a number out of range before sending", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/venue/managers"
        ? { ok: true, json: async () => ({ managers: [] }) }
        : { ok: true, json: async () => ({ venueName: "Лотос", email: "a@b.mk", coupleSeatingSelfEditEnabled: true }) },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    render(
      <ManagerElevationContext.Provider value={owner}>
        <SettingsClient />
      </ManagerElevationContext.Provider>,
    );
    const input = await screen.findByLabelText("Рок за одговор на гостите (дена пред настанот)");
    expect(input).toHaveValue(15);
    fireEvent.change(input, { target: { value: "400" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("Внесете број на денови од 0 до 365.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/venue/settings")).toHaveLength(1);
  });
});
