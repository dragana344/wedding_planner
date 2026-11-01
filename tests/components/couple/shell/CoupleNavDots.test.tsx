import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/couple", useRouter: () => ({ push: vi.fn() }) }));

import { CoupleShell } from "@/components/couple/shell/CoupleShell";
import { buildCoupleNavItems } from "@/components/couple/shell/nav";

describe("couple nav dots", () => {
  it("marks only the sections flagged", () => {
    const items = buildCoupleNavItems([], { menu: true, budget: true });
    const dotted = items.filter((i) => i.dot).map((i) => i.label);
    expect(dotted).toEqual(["Мени", "Буџет"]);
  });

  it("renders a dot with an accessible name on the flagged links only", () => {
    render(
      <CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]} dots={{ guests: true }}>
        <p>content</p>
      </CoupleShell>,
    );
    expect(screen.getByRole("link", { name: /Гости.*не е видено/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Мени" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Буџет" })).toBeInTheDocument();
  });

  it("puts Известувања first in the planning group, with a dot when flagged", () => {
    const items = buildCoupleNavItems([{ id: "r1", name: "Сала" }], { notifications: true });
    const planning = items.filter((i) => i.group === "planning");
    expect(planning[0]).toMatchObject({ label: "Известувања", href: "/couple/notifications", icon: "bell", dot: true });
    expect(items.filter((i) => i.dot).map((i) => i.label)).toEqual(["Известувања"]);
  });

  it("renders the Известувања dot with an accessible name", () => {
    render(
      <CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]} dots={{ notifications: true }}>
        <p>content</p>
      </CoupleShell>,
    );
    expect(screen.getByRole("link", { name: /Известувања.*не е видено/ })).toBeInTheDocument();
  });

  it("shows no dots by default", () => {
    render(<CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]}><p>content</p></CoupleShell>);
    expect(screen.queryByText(/не е видено/)).toBeNull();
  });
});
