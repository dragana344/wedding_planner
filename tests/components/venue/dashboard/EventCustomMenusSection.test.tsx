import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  elevation: {
    managerName: null as string | null,
    token: null as string | null,
  },
  del: vi.fn(),
  copy: vi.fn(),
  refresh: vi.fn(),
  listTemplates: vi.fn(),
  listCustom: vi.fn(),
  listItems: vi.fn(),
}));
vi.mock("@/components/venue/shell/ManagerElevationContext", () => ({
  useManagerElevation: () => mocks.elevation,
  reportElevationRejected: vi.fn(),
}));
vi.mock("@/lib/venue/custom-menu-client", () => ({
  saveCustomMenuViaApi: vi.fn(),
  deleteCustomMenuViaApi: mocks.del,
  copyCustomMenuViaApi: mocks.copy,
}));
vi.mock("@/lib/venue/menus", async (orig) => ({
  ...(await orig<object>()),
  listMenuTemplatesWithItems: mocks.listTemplates,
  listEventCustomMenus: mocks.listCustom,
  listMenuItems: mocks.listItems,
}));
vi.mock("@/lib/date", async (orig) => ({
  ...(await orig<object>()),
  todayIn: () => "2026-10-30",
}));

import { MenusClient } from "@/components/venue/dashboard/MenusClient";
import { EventCustomMenusSection } from "@/components/venue/dashboard/EventCustomMenusSection";

const dish = {
  id: "d1",
  venue_id: "v1",
  tiers: [],
  course: "main" as const,
  name: "Сарма",
  allergen_tags: [],
  is_vegetarian: false,
  is_vegan: false,
  price: 10,
  photo_path: null,
};
function menu(
  id: string,
  name: string,
  couple: string,
  date: string,
  latestCount: number | null = null,
) {
  return {
    id,
    venue_id: "v1",
    name,
    description: null,
    items: [dish],
    event: { id: `e-${id}`, couple_names: couple, event_date: date },
    latestCount,
  };
}
const menus = [
  menu("m2", "Мени Позно", "Ана и Марко", "2027-06-14", 80),
  menu("m1", "Мени Рано", "Борис", "2027-01-02"),
  menu("m0", "Мени Минато", "Стар пар", "2025-05-05"),
];

function renderIt() {
  return render(
    <EventCustomMenusSection
      venueId="v1"
      menus={menus}
      items={[dish]}
      onChanged={mocks.refresh}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.elevation.managerName = null;
  mocks.elevation.token = null;
});

describe("EventCustomMenusSection", () => {
  it('upcoming first; past folded under "Поминати"', () => {
    renderIt();
    expect(
      screen.getByRole("heading", { name: "Сопствени менија за настани" }),
    ).toBeInTheDocument();
    const upcoming = screen
      .getAllByText(/^Мени (Позно|Рано)$/)
      .map((e) => e.textContent);
    expect(upcoming).toEqual(["Мени Рано", "Мени Позно"]);
    expect(screen.getByText("Ана и Марко · 14.06.2027")).toBeInTheDocument();
    expect(screen.getByText("80 гости")).toBeInTheDocument();
    expect(screen.queryByText("Мени Минато")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Поминати/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Мени Минато")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Отвори настан" })[0],
    ).toHaveAttribute("href", "/venue/events?event=e-m1");
  });

  it("staff see no Избриши/Уреди/Направи стандарден пакет; managers do", () => {
    const { unmount } = renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Поминати/ }));
    expect(
      screen.queryByRole("button", { name: "Уреди" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Избриши" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Направи стандарден пакет" }),
    ).not.toBeInTheDocument();
    unmount();
    mocks.elevation.managerName = "Менаџер";
    renderIt();
    expect(screen.getAllByRole("button", { name: "Уреди" }).length).toBe(2);
    expect(
      screen.getAllByRole("button", { name: "Направи стандарден пакет" })
        .length,
    ).toBe(2);
  });

  it("Избриши only on past cards, behind a confirm", async () => {
    mocks.elevation.managerName = "Менаџер";
    mocks.elevation.token = "tok";
    mocks.del.mockResolvedValue(undefined);
    renderIt();
    expect(
      screen.queryByRole("button", { name: "Избриши" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Поминати/ }));
    expect(screen.getAllByRole("button", { name: "Избриши" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Избриши" }));
    expect(mocks.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Потврди бришење" }));
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith("m0", "tok"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });
});

describe("MenusClient copy", () => {
  it("after a successful copy the new package appears in the standard section", async () => {
    mocks.elevation.managerName = "Менаџер";
    mocks.copy.mockResolvedValue({ id: "t9" });
    const copied = {
      id: "t9",
      venue_id: "v1",
      name: "Мени Рано (Борис)",
      description: null,
      items: [dish],
    };
    mocks.listTemplates.mockResolvedValue([copied]);
    mocks.listCustom.mockResolvedValue(menus);
    render(
      <MenusClient
        venueId="v1"
        initialItems={[dish]}
        initialTemplates={[]}
        initialCustomMenus={menus}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Пакети" }));
    expect(screen.queryByText("Мени Рано (Борис)")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Направи стандарден пакет" })[0],
    );
    expect(await screen.findByText("Мени Рано (Борис)")).toBeInTheDocument();
  });
});
