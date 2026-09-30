import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/couple/budget", useRouter: () => ({ push: vi.fn() }) }));

import { CoupleShell } from "@/components/couple/shell/CoupleShell";

describe("couple lock UI (spec §4.4)", () => {
  it("marks locked nav items and shows the banner on a locked page", () => {
    render(
      <CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]} lockedFeatures={["budget"]}>
        <p>content</p>
      </CoupleShell>,
    );
    expect(screen.getByRole("link", { name: /Буџет/ })).toHaveAttribute("data-locked", "true");
    expect(screen.getByText(/Оваа функција не е вклучена во вашиот пакет/)).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("gives a locked nav item an accessible name a screen reader announces as locked", () => {
    render(
      <CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]} lockedFeatures={["budget"]}>
        <p>content</p>
      </CoupleShell>,
    );
    // The 🔒 marker is aria-hidden (decorative); the accessible name must
    // still say "locked" via a visually-hidden suffix (review ruling).
    expect(screen.getByRole("link", { name: /Буџет.*заклучено/ })).toHaveAttribute("data-locked", "true");
  });

  it("shows no banner when nothing is locked", () => {
    render(<CoupleShell coupleNames="Ана и Марко" eventDate="2028-06-01" rooms={[]} lockedFeatures={[]}><p>content</p></CoupleShell>);
    expect(screen.queryByText(/не е вклучена/)).toBeNull();
  });
});
