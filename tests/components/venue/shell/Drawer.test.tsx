import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelShell } from "@/components/venue/shell/PanelShell";
import { CoupleShell } from "@/components/couple/shell/CoupleShell";

// D1: under 900px the sidebar becomes a drawer opened from a "Мени" button in
// the top bar. Both panels share the behaviour (useDrawer).

let pathname = "/venue";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const shells = [
  { name: "venue", path: "/venue", ui: () => <PanelShell venueName="Сала">x</PanelShell> },
  {
    name: "couple",
    path: "/couple",
    ui: () => (
      <CoupleShell coupleNames="Ана и Марко" eventDate="01.06.2027" rooms={[{ id: "r1", name: "Сала" }]}>
        x
      </CoupleShell>
    ),
  },
];

describe.each(shells)("$name shell drawer", ({ path, ui }) => {
  beforeEach(() => {
    pathname = path;
    document.body.style.overflow = "";
  });

  const button = () => screen.getByRole("button", { name: "Мени" });
  const drawer = () => document.getElementById("panel-nav")!;

  it("opens from the menu button and locks page scroll", async () => {
    render(ui());
    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(button()).toHaveAttribute("aria-controls", "panel-nav");
    await userEvent.click(button());
    expect(button()).toHaveAttribute("aria-expanded", "true");
    expect(drawer()).toHaveClass("open");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape and returns focus to the menu button", async () => {
    render(ui());
    await userEvent.click(button());
    await userEvent.keyboard("{Escape}");
    expect(drawer()).not.toHaveClass("open");
    expect(button()).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps Tab inside the open drawer", async () => {
    render(ui());
    await userEvent.click(button());
    const focusable = Array.from(drawer().querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    focusable[focusable.length - 1].focus();
    await userEvent.tab();
    expect(focusable[0]).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(focusable[focusable.length - 1]).toHaveFocus();
  });

  it("closes when the scrim is clicked", async () => {
    render(ui());
    await userEvent.click(button());
    fireEvent.click(document.querySelector(".scrim")!);
    expect(drawer()).not.toHaveClass("open");
  });

  it("closes when the route changes", async () => {
    const { rerender } = render(ui());
    await userEvent.click(button());
    pathname = `${path}/other`;
    act(() => rerender(ui()));
    expect(drawer()).not.toHaveClass("open");
  });
});
