import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const menus = vi.hoisted(() => ({
  listArchivedMenuTemplates: vi.fn(),
  restoreMenuTemplate: vi.fn(),
}));
vi.mock("@/lib/venue/menus", () => menus);

import { ArchivedPackages } from "@/components/venue/dashboard/ArchivedPackages";

afterEach(() => vi.clearAllMocks());

describe("ArchivedPackages", () => {
  it("lists archived packages and restores one with Врати", async () => {
    menus.listArchivedMenuTemplates
      .mockResolvedValueOnce([{ id: "p1", name: "Стар пакет", archived_at: "2026-11-01T10:00:00Z" }])
      .mockResolvedValueOnce([]);
    menus.restoreMenuTemplate.mockResolvedValue(undefined);
    const onRestored = vi.fn();
    render(<ArchivedPackages venueId="v1" onRestored={onRestored} />);
    expect(await screen.findByText("Стар пакет")).toBeInTheDocument();
    expect(screen.getByText(/архивиран 01.11.2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Врати" }));
    await waitFor(() => expect(menus.restoreMenuTemplate).toHaveBeenCalledWith("p1"));
    expect(onRestored).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Стар пакет")).toBeNull());
  });

  it("shows nothing without archived packages", async () => {
    menus.listArchivedMenuTemplates.mockResolvedValue([]);
    const { container } = render(<ArchivedPackages venueId="v1" onRestored={vi.fn()} />);
    await waitFor(() => expect(menus.listArchivedMenuTemplates).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
