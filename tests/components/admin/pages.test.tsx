import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn(async () => ({ adminUserId: "a", requestId: null })) }));
// PlansPage renders CreatePlanForm (client component), which calls
// useRouter() for the post-create redirect — needs a mount, same as
// AdminLogin.test.tsx's mock.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/admin/queries", () => ({
  getOverviewStats: vi.fn(async () => ({ venues: 12, activeVenues: 7, blockedVenues: 1, signupsByWeek: Array.from({ length: 8 }, (_, i) => ({ week: `2028-01-0${i + 1}`, count: i })), upcomingEvents: 5, newMessages: 3 })),
  listAudit: vi.fn(async () => ({ rows: [], hasMore: false })),
  listVenues: vi.fn(async () => [{ id: "v1", name: "Сала Езеро", planId: "p", planName: "Стандарден", createdAt: "2028-01-01T00:00:00Z", staffCount: 2, eventCount: 9, lastSignInAt: null, blockedAt: null }]),
  listPlans: vi.fn(async () => [
    { id: "p1", name: "Стандарден", description: null, sortOrder: 0, isDefault: true, isPublic: false, venueCount: 3, features: {} },
  ]),
}));

import OverviewPage from "@/app/admin/(panel)/page";
import VenuesPage from "@/app/admin/(panel)/venues/page";
import PlansPage from "@/app/admin/(panel)/plans/page";

describe("admin pages", () => {
  it("overview shows the counts", async () => {
    render(await OverviewPage());
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Активни (30 дена)")).toBeInTheDocument();
  });
  it("venues list links to detail", async () => {
    render(await VenuesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Сала Езеро" })).toHaveAttribute("href", "/admin/venues/v1");
  });
  it("plans list links to detail and shows the default badge", async () => {
    render(await PlansPage());
    expect(screen.getByRole("link", { name: "Стандарден" })).toHaveAttribute("href", "/admin/plans/p1");
    expect(screen.getByRole("cell", { name: "Да" })).toBeInTheDocument();
  });
});
