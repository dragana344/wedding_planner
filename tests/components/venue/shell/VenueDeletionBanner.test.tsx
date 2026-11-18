import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/venue/events",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { VenueDeletionBanner, VENUE_DATA_EXPORT_HREF } from "@/components/venue/shell/VenueDeletionBanner";
import { PanelShell } from "@/components/venue/shell/PanelShell";

// 0172: an admin-scheduled venue deletion is announced on every venue page.
describe("VenueDeletionBanner", () => {
  it("states the deletion date (DD.MM.YYYY, Skopje) and links to the data export", () => {
    // 23:30 UTC on 2 Dec is already 3 Dec in Skopje.
    render(<VenueDeletionBanner scheduledFor="2026-12-02T23:30:00Z" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Сметката на локалот ќе биде избришана на 03.12.2026. Преземете ги вашите податоци пред тоа.",
    );
    expect(screen.getByRole("link", { name: "Преземи ги податоците" })).toHaveAttribute("href", VENUE_DATA_EXPORT_HREF);
    expect(VENUE_DATA_EXPORT_HREF).toBe("/venue/settings#podatoci");
  });

  it("renders nothing when no deletion is scheduled", () => {
    const { container } = render(<VenueDeletionBanner scheduledFor={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is part of the venue panel shell, above the page content", () => {
    const { rerender } = render(
      <PanelShell venueName="Diamond Hall" deletionScheduledFor="2026-12-03T10:00:00Z">
        <p>content</p>
      </PanelShell>,
    );
    expect(screen.getByText(/ќе биде избришана на/)).toHaveTextContent("03.12.2026");
    rerender(
      <PanelShell venueName="Diamond Hall">
        <p>content</p>
      </PanelShell>,
    );
    expect(screen.queryByText(/ќе биде избришана на/)).toBeNull();
  });
});
