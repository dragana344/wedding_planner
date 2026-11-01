import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VenueNav } from "@/components/venue/shell/VenueNav";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";
import { vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));

function renderNav(badges?: Partial<Record<string, number>>) {
  return render(<ManagerElevationProvider><VenueNav activeHref="/venue" isLocked={() => false} badges={badges} /></ManagerElevationProvider>);
}

describe("VenueNav badges", () => {
  it("shows the count on Настани", () => {
    renderNav({ "/venue/events": 3 });
    const badge = screen.getByLabelText("3 настани со промени");
    expect(badge).toHaveClass("nav-badge");
    expect(badge).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Настани/ })).toContainElement(badge);
  });

  it("hides the badge at 0 and when absent", () => {
    renderNav({ "/venue/events": 0 });
    expect(document.querySelector(".nav-badge")).toBeNull();
    document.body.innerHTML = "";
    renderNav();
    expect(document.querySelector(".nav-badge")).toBeNull();
  });
});
