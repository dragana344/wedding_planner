import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// vi.mock's factory is hoisted above every top-level statement in this file
// (including plain `const` declarations, per tests/components/admin/PlanAdminPanels.test.tsx's
// note) — the brief draft's bare `const listAudit = vi.fn(...)` hit the TDZ
// ("Cannot access 'listAudit' before initialization"). vi.hoisted() is this
// codebase's fix for that.
const { mockListAudit } = vi.hoisted(() => ({
  mockListAudit: vi.fn(async () => ({ rows: [{ id: 1, occurredAt: "2028-01-01T10:00:00Z", actorType: "admin", actorId: "a", action: "admin_venue_blocked", venueId: "v1", eventId: null, targetId: null, requestId: "r1", details: { reason_length: 9 } }], hasMore: true })),
}));
vi.mock("@/lib/admin/queries", () => ({ listAudit: mockListAudit }));
vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn(async () => ({ adminUserId: "a", requestId: null })) }));

import AuditPage from "@/app/admin/(panel)/audit/page";

describe("audit page", () => {
  it("passes filters through and pages", async () => {
    render(await AuditPage({ searchParams: Promise.resolve({ action: "admin_venue_blocked", page: "2" }) }));
    expect(mockListAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin_venue_blocked", page: 2 }));
    expect(screen.getByText("admin_venue_blocked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Следна" })).toHaveAttribute("href", expect.stringContaining("page=3"));
  });
});
