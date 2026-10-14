import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn(async () => ({ adminUserId: "a", requestId: null })) }));
// PlansPage renders CreatePlanForm (client component), which calls
// useRouter() for the post-create redirect — needs a mount, same as
// AdminLogin.test.tsx's mock.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/admin/queries", () => ({
  getOverviewStats: vi.fn(async () => ({ venues: 12, activeVenues: 7, blockedVenues: 1, signupsByWeek: Array.from({ length: 4 }, (_, i) => ({ week: `2028-01-0${i + 1}`, count: i })), upcomingEvents: 5, newMessages: 3 })),
  getSignupsByWeek: vi.fn(async () => [{ week: "2028-02-01", count: 2 }]),
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
    render(await OverviewPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Активни (30 дена)")).toBeInTheDocument();
  });
  it("resetting one date-range popup keeps the other popup's range intact", async () => {
    render(
      await OverviewPage({
        searchParams: Promise.resolve({ signupsFrom: "2028-01-01", signupsTo: "2028-01-31", actionsFrom: "2028-02-01", actionsTo: "2028-02-07" }),
      })
    );
    const resetLinks = screen.getAllByRole("link", { name: "Избери друг период" });
    expect(resetLinks).toHaveLength(2);
    // The signups popup's reset must drop signupsFrom/To but keep actionsFrom/To.
    expect(resetLinks[0]).toHaveAttribute("href", "/admin?actionsFrom=2028-02-01&actionsTo=2028-02-07");
    // And vice versa for the actions popup's reset.
    expect(resetLinks[1]).toHaveAttribute("href", "/admin?signupsFrom=2028-01-01&signupsTo=2028-01-31");
  });

  it("places each popup's arrow right next to its own title, not at the far end of the row", async () => {
    render(await OverviewPage({ searchParams: Promise.resolve({}) }));
    const heading = screen.getByText("Регистрации по недела (последни 4)");
    const group = heading.parentElement!;
    expect(group.querySelector("h2")).toBe(heading);
    expect(group.querySelector("button[aria-label^='Избери период']")).toBeTruthy();
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
