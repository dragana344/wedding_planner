import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// A new dish whose photo fails to upload: the dish is already saved, so the
// message says so, and a retry must not add the dish a second time.

const lib = vi.hoisted(() => ({ addMenuItem: vi.fn(), updateMenuItem: vi.fn(), uploadMenuItemPhoto: vi.fn() }));
vi.mock("@/lib/venue/menus", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));

import { MenuItemForm } from "@/components/venue/MenuItemForm";

const saved = { id: "d1", venue_id: "v1", tiers: ["special"], course: "main", name: "Пиле", allergen_tags: [], is_vegetarian: false, is_vegan: false, price: null, photo_path: null };

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  lib.addMenuItem.mockResolvedValue(saved);
  lib.updateMenuItem.mockResolvedValue({ ...saved, photo_path: "v1/d1.jpg" });
});

function fill(container: HTMLElement) {
  fireEvent.change(screen.getByLabelText(/Име на јадењето/), { target: { value: "Пиле" } });
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [new File(["x"], "pile.jpg", { type: "image/jpeg" })] } });
}

describe("MenuItemForm", () => {
  it("says the dish is saved when only the photo failed, and a retry adds no duplicate", async () => {
    const onSaved = vi.fn();
    lib.uploadMenuItemPhoto.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce("v1/d1.jpg");
    const { container } = render(<MenuItemForm venueId="v1" onSaved={onSaved} />);
    fill(container);

    fireEvent.click(screen.getByRole("button", { name: "Додади јадење" }));
    expect(await screen.findByText(/Јадењето е зачувано, но фотографијата не се прикачи/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Додади јадење" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(lib.addMenuItem).toHaveBeenCalledTimes(1);
    expect(lib.uploadMenuItemPhoto).toHaveBeenCalledTimes(2);
    expect(lib.updateMenuItem).toHaveBeenLastCalledWith("d1", expect.objectContaining({ name: "Пиле", photo_path: "v1/d1.jpg" }));
  });

  it("adds a dish with its photo in one go", async () => {
    const onSaved = vi.fn();
    lib.uploadMenuItemPhoto.mockResolvedValue("v1/d1.jpg");
    const { container } = render(<MenuItemForm venueId="v1" onSaved={onSaved} />);
    fill(container);
    fireEvent.click(screen.getByRole("button", { name: "Додади јадење" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(lib.addMenuItem).toHaveBeenCalledTimes(1);
  });
});
