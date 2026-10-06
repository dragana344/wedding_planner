import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// PanelShell renders OnboardingTour (lazily, inside Suspense), which also
// calls useRouter/useSearchParams — mirrors tests/components/venue/shell/OnboardingTour.test.tsx.
vi.mock("next/navigation", () => ({
  usePathname: () => "/venue/reports",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { PanelShell } from "@/components/venue/shell/PanelShell";

describe("venue lock UI (spec §4.4)", () => {
  it("marks a locked nav item as locked (data-locked and an accessible name) and shows the banner", () => {
    render(
      <PanelShell venueName="Diamond Hall" lockedFeatures={["reports"]}>
        <p>content</p>
      </PanelShell>,
    );
    // The 🔒 marker is aria-hidden (decorative); the accessible name must
    // still say "locked" via a visually-hidden suffix (review ruling).
    expect(screen.getByRole("link", { name: /Извештаи.*заклучено/ })).toHaveAttribute("data-locked", "true");
    expect(screen.getByText(/Оваа функција не е вклучена во вашиот пакет/)).toBeInTheDocument();
    // The page stays mounted but blurred, inert and hidden from assistive tech.
    const veil = screen.getByText("content").closest(".locked-blur");
    expect(veil).toHaveAttribute("aria-hidden", "true");
    expect(veil).toHaveAttribute("inert");
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
