import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";
import type { Room } from "@/lib/venue/rooms";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const clientActions = vi.hoisted(() => vi.fn());
vi.mock("@/lib/venue/seating-client", () => ({ venueSeatingClientActions: clientActions }));

import { VenueEventSeating } from "@/components/venue/dashboard/VenueEventSeating";

const room = { id: "r1", venue_id: "v1", name: "Сала", width_cm: 1000, height_cm: 800 } as Room;

function renderAs(managerName: string | null, pastEvent = false) {
  clientActions.mockReturnValue({
    initializeFromStandard: vi.fn().mockResolvedValue([]),
    captureSnapshot: vi.fn(),
    listLayoutElements: vi.fn().mockResolvedValue([]),
  });
  render(
    <ManagerElevationContext.Provider
      value={{ managerName, isOwner: false, token: managerName ? "tok" : null, elevate: async () => ({ ok: true as const }), deAuthorize: () => {}, passwordResetNoticeAt: null, dismissPasswordResetNotice: async () => {} }}
    >
      <VenueEventSeating eventId="e1" eventName="Пар" room={room} initialFixedElements={[]} initialLayoutElements={[]} initialTableTypes={[]} pastEvent={pastEvent} />
    </ManagerElevationContext.Provider>,
  );
}

describe("VenueEventSeating", () => {
  it("is look-only for plain staff", () => {
    renderAs(null);
    expect(screen.getByRole("status")).toHaveTextContent("најавете се како менаџер");
    expect(screen.queryByRole("button", { name: "+ Бина" })).not.toBeInTheDocument();
  });

  it("is editable for an elevated manager, whose token reaches the actions", () => {
    renderAs("Марко");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Бина" })).toBeInTheDocument();
    expect(clientActions).toHaveBeenLastCalledWith("e1", "tok");
  });

  it("is look-only for a past event even for a manager", () => {
    renderAs("Марко", true);
    expect(screen.getByRole("status")).toHaveTextContent("настанот е завршен");
    expect(screen.queryByRole("button", { name: "+ Бина" })).not.toBeInTheDocument();
  });
});
