import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// PanelShell renders OnboardingTour (lazily, inside Suspense), which also
// calls useRouter/useSearchParams — mirrors tests/components/venue/shell/OnboardingTour.test.tsx.
vi.mock("next/navigation", () => ({
  usePathname: () => "/venue/reports",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { PanelShell } from "@/components/venue/shell/PanelShell";

// Извештаи is hidden from the sidebar entirely for unelevated staff (new
// behaviour), so the lock-banner test below — about entitlements gating, not
// elevation gating — elevates through the real AccountMenu flow first, same
// as tests/components/venue/shell/AccountMenu.test.tsx: PanelShell owns its
// own ManagerElevationProvider internally, so a pre-seeded outer context
// would just be shadowed by it.
const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

async function elevateAsManager() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ token: "tok1", expiresAt: new Date(Date.now() + 10000).toISOString(), managerName: "Марко", isOwner: false }),
  });
  fireEvent.click(screen.getByRole("button", { name: /Diamond Hall/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Логирај се како менаџер/ }));
  fireEvent.change(screen.getByLabelText("Име"), { target: { value: "Марко" } });
  fireEvent.change(screen.getByLabelText("Лозинка"), { target: { value: "pw-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Најави се" }));
  await waitFor(() => expect(screen.getByRole("menuitem", { name: "Одјави се од менаџер" })).toBeInTheDocument());
}

describe("venue lock UI (spec §4.4)", () => {
  it("marks a locked nav item as locked (data-locked and an accessible name) and shows the banner", async () => {
    render(
      <PanelShell venueName="Diamond Hall" lockedFeatures={["reports"]}>
        <p>content</p>
      </PanelShell>,
    );
    await elevateAsManager();
    // The 🔒 marker is aria-hidden (decorative); the accessible name must
    // still say "locked" via a visually-hidden suffix (review ruling).
    expect(screen.getByRole("link", { name: /Извештаи.*заклучено/ })).toHaveAttribute("data-locked", "true");
    expect(screen.getByText(/Оваа функција не е вклучена во вашиот пакет/)).toBeInTheDocument();
    // The page stays mounted but blurred, inert and hidden from assistive tech.
    const veil = screen.getByText("content").closest(".locked-blur");
    expect(veil).toHaveAttribute("aria-hidden", "true");
    expect(veil).toHaveAttribute("inert");
  });

  it("shows no banner when nothing is locked", async () => {
    render(
      <PanelShell venueName="Diamond Hall" lockedFeatures={[]}>
        <p>content</p>
      </PanelShell>,
    );
    await elevateAsManager();
    expect(screen.queryByText(/не е вклучена/)).toBeNull();
  });

  it("hides Извештаи from the nav entirely when not elevated as a manager", () => {
    render(
      <PanelShell venueName="Diamond Hall" lockedFeatures={[]}>
        <p>content</p>
      </PanelShell>,
    );
    expect(screen.queryByRole("link", { name: /Извештаи/ })).not.toBeInTheDocument();
  });

  it("hides Поставки from the nav for a non-owner manager", async () => {
    render(
      <PanelShell venueName="Diamond Hall" lockedFeatures={[]}>
        <p>content</p>
      </PanelShell>,
    );
    expect(screen.queryByRole("link", { name: /Поставки/ })).not.toBeInTheDocument();
    await elevateAsManager();
    expect(screen.getByRole("link", { name: /Извештаи/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Поставки/ })).not.toBeInTheDocument();
  });
});
