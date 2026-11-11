import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VenueNav } from "@/components/venue/shell/VenueNav";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";
import { vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));

function renderNav(badges?: Partial<Record<string, number>>, dots?: Partial<Record<string, boolean>>) {
  return render(
    <ManagerElevationProvider>
      <VenueNav activeHref="/venue" isLocked={() => false} badges={badges} dots={dots} />
    </ManagerElevationProvider>,
  );
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

describe("VenueNav dots", () => {
  it("shows a plain unseen-dot on Известувања, no count", () => {
    renderNav(undefined, { "/venue/notifications": true });
    const dot = document.querySelector(".unseen-dot");
    expect(dot).not.toBeNull();
    expect(screen.getByRole("link", { name: /Известувања/ })).toContainElement(dot as HTMLElement);
    expect(document.querySelector(".nav-badge")).toBeNull();
  });

  it("hides the dot when false or absent", () => {
    renderNav(undefined, { "/venue/notifications": false });
    expect(document.querySelector(".unseen-dot")).toBeNull();
    document.body.innerHTML = "";
    renderNav();
    expect(document.querySelector(".unseen-dot")).toBeNull();
  });

  it("prefers a count badge over a dot when both are given for the same item", () => {
    renderNav({ "/venue/notifications": 2 }, { "/venue/notifications": true });
    expect(document.querySelector(".nav-badge")).not.toBeNull();
    expect(document.querySelector(".unseen-dot")).toBeNull();
  });
});
