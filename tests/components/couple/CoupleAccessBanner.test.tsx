import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/couple/budget", useRouter: () => ({ push: vi.fn() }) }));

import { CoupleShell } from "@/components/couple/shell/CoupleShell";
import { CoupleAccessBanner } from "@/components/couple/shell/CoupleAccessBanner";
import { AddPanel } from "@/components/shared/AddPanel";
import { COUPLE_DOWNLOADS_HREF } from "@/lib/couple/access";

// Group A task 2: the couple's access life cycle in the panel.

describe("CoupleAccessBanner", () => {
  it("after the event: read-only until the end date (dd.mm.yyyy), with a link to the downloads", () => {
    render(<CoupleAccessBanner phase="memories" accessEnd="2027-12-05" cancelled={false} isWedding />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(
      "Свадбата помина. Пристапот е само за преглед до 05.12.2027 — потоа податоците се бришат. Преземете сè што сакате да зачувате.",
    );
    expect(screen.getByRole("link", { name: "Преземете сè што сакате да зачувате." })).toHaveAttribute("href", COUPLE_DOWNLOADS_HREF);
  });

  it("says 'Настанот' for an event that is not a wedding", () => {
    render(<CoupleAccessBanner phase="memories" accessEnd="2027-12-05" cancelled={false} isWedding={false} />);
    expect(screen.getByRole("status").textContent).toMatch(/^Настанот помина\./);
  });

  it("a cancelled event before its date: says when access ends", () => {
    render(<CoupleAccessBanner phase="active" accessEnd="2026-12-18" cancelled isWedding />);
    expect(screen.getByRole("status").textContent).toBe("Настанот е откажан. Пристапот завршува на 18.12.2026.");
  });

  it("shows nothing for an active, not cancelled event", () => {
    const { container } = render(<CoupleAccessBanner phase="active" accessEnd="2027-12-05" cancelled={false} isWedding />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CoupleShell read-only period", () => {
  const shell = (phase: "active" | "memories") => (
    <CoupleShell coupleNames="Ана и Марко" eventDate="2027-06-05" rooms={[]} access={{ phase, end: "2027-12-05", cancelled: false, isWedding: true }}>
      <AddPanel title="Нов гостин">
        <p>add form</p>
      </AddPanel>
      <AddPanel title="Пријавете проблем" ignoreReadOnly>
        <p>support form</p>
      </AddPanel>
    </CoupleShell>
  );

  it("shows the banner and hides the add panels, except the ones that stay open (support)", () => {
    render(shell("memories"));
    expect(screen.getByText(/Пристапот е само за преглед до 05\.12\.2027/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Нов гостин/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Пријавете проблем/ })).toBeInTheDocument();
  });

  it("keeps the add panels and shows no banner while the event is active", () => {
    render(shell("active"));
    expect(screen.queryByText(/само за преглед/)).toBeNull();
    expect(screen.getByRole("button", { name: /Нов гостин/ })).toBeInTheDocument();
  });
});
