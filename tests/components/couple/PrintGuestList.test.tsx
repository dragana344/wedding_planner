import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PrintGuestList } from "@/components/couple/guests/print/PrintGuestList";
import type { PrintGuestGroup } from "@/lib/couple/guest-print";

const groups: PrintGuestGroup[] = [
  {
    label: "Страна на невестата",
    totalPeople: 3,
    rows: [
      { id: "g1", fullName: "Ана Петровска", phone: "070 111 222", partySize: 3, childrenCount: 1, status: "Потврден", menu: "Класично 2, Посно 1", allergies: "ореви" },
    ],
  },
  { label: "Страна на младоженецот", totalPeople: 0, rows: [] },
];

describe("PrintGuestList (couple guest list print view)", () => {
  it("prints a page with the couple, date, a group heading per side and the guest's details", () => {
    render(<PrintGuestList title="Ана & Марко" subtitle="12 јуни 2027 · Leona Lux" groups={groups} />);
    expect(screen.getByRole("region", { name: "Листа на гости" })).toBeInTheDocument();
    expect(screen.getByText("Ана & Марко")).toBeInTheDocument();
    expect(screen.getByText("12 јуни 2027 · Leona Lux")).toBeInTheDocument();
    expect(screen.getByText("Страна на невестата")).toBeInTheDocument();
    expect(screen.getByText("3 лица")).toBeInTheDocument();
    const row = screen.getByText("Ана Петровска").closest("tr")!;
    expect(within(row).getByText("070 111 222")).toBeInTheDocument();
    expect(within(row).getByText("3 (1 деца)")).toBeInTheDocument();
    expect(within(row).getByText("Потврден")).toBeInTheDocument();
    expect(within(row).getByText("Класично 2, Посно 1")).toBeInTheDocument();
    expect(within(row).getByText("ореви")).toBeInTheDocument();
  });

  it("shows 'Нема гости' for an empty group instead of an empty table", () => {
    render(<PrintGuestList title="Ана & Марко" subtitle="" groups={groups} />);
    expect(screen.getByText("Нема гости.")).toBeInTheDocument();
  });

  it("has no group heading for an ungrouped (non-wedding) list", () => {
    const ungrouped: PrintGuestGroup[] = [{ label: null, totalPeople: 1, rows: groups[0].rows }];
    render(<PrintGuestList title="Прослава" subtitle="" groups={ungrouped} />);
    expect(screen.queryByText("лица")).not.toBeInTheDocument();
    expect(screen.getByText("Ана Петровска")).toBeInTheDocument();
  });

  it("has a print button", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrintGuestList title="А" subtitle="" groups={groups} />);
    fireEvent.click(screen.getByRole("button", { name: "Печати" }));
    expect(print).toHaveBeenCalled();
  });

  it("shows a back link only when given one", () => {
    render(<PrintGuestList title="А" subtitle="" groups={groups} backHref="/couple/guests" />);
    expect(screen.getByRole("link", { name: "← Назад" })).toHaveAttribute("href", "/couple/guests");
  });
});
