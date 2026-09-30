import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// PanelShell renders OnboardingTour (lazily, inside Suspense), which also
// calls useRouter/useSearchParams — mirrors tests/components/venue/shell/OnboardingTour.test.tsx.
vi.mock("next/navigation", () => ({
  usePathname: () => "/venue/reservations",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { PanelShell } from "@/components/venue/shell/PanelShell";

describe("venue lock UI (spec §4.4)", () => {
  it("marks a locked nav item as locked (data-locked and an accessible name) and shows the banner", () => {
    render(
      <PanelShell venueName="Diamond Hall" lockedFeatures={["reservations"]}>
        <p>content</p>
      </PanelShell>,
    );
    // The 🔒 marker is aria-hidden (decorative); the accessible name must
    // still say "locked" via a visually-hidden suffix (review ruling).
    expect(screen.getByRole("link", { name: /Резервации.*заклучено/ })).toHaveAttribute("data-locked", "true");
    expect(screen.getByText(/Оваа функција не е вклучена во вашиот пакет/)).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows no banner when nothing is locked", () => {
    render(
      <PanelShell venueName="Diamond Hall" lockedFeatures={[]}>
        <p>content</p>
      </PanelShell>,
    );
    expect(screen.queryByText(/не е вклучена/)).toBeNull();
  });
});
