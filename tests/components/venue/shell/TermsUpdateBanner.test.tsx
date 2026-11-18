import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/venue/events" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { TermsUpdateBanner, VENUE_TERMS_HREF } from "@/components/venue/shell/TermsUpdateBanner";
import { PanelShell } from "@/components/venue/shell/PanelShell";

// A newer Terms version is a banner on the venue pages, never a blocking screen.
describe("TermsUpdateBanner", () => {
  it("says the owner has to accept, and links to the in-panel page", () => {
    render(<TermsUpdateBanner pending onTermsPage={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Ажурирани се условите за користење — сопственикот треба да ги прифати.");
    expect(screen.getByRole("link", { name: "Прочитај и прифати" })).toHaveAttribute("href", VENUE_TERMS_HREF);
    expect(VENUE_TERMS_HREF).toBe("/venue/terms");
  });

  it("renders nothing when nothing is pending, or on the terms page itself", () => {
    expect(render(<TermsUpdateBanner pending={false} onTermsPage={false} />).container).toBeEmptyDOMElement();
    expect(render(<TermsUpdateBanner pending onTermsPage />).container).toBeEmptyDOMElement();
  });

  it("sits in the panel shell above the page content, which stays usable", () => {
    nav.pathname = "/venue/events";
    render(
      <PanelShell venueName="Diamond Hall" termsUpdatePending>
        <p>content</p>
      </PanelShell>,
    );
    expect(screen.getByText(/Ажурирани се условите/)).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
