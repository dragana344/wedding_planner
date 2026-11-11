import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/venue/menus", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMenuItemPhotoUrl: (path: string | null) => (path ? `https://cdn.test/${path}` : null),
}));

import { MenuCardContent, type MenuDetailItem } from "@/components/venue/dashboard/MenuCardContent";

const withPhoto: MenuDetailItem = { id: "d1", name: "Шопска салата", course: "starter", photo_path: "v1/d1.jpg" };
const withoutPhoto: MenuDetailItem = { id: "d2", name: "Леб", course: "starter", photo_path: null };

describe("MenuCardContent dish photos", () => {
  it("shows a thumbnail image (not just a generic icon) for a dish with a photo", () => {
    render(<MenuCardContent title="Класично мени" items={[withPhoto]} onPhotoClick={vi.fn()} />);
    const img = screen.getByRole("img", { name: "Шопска салата" });
    expect(img).toHaveAttribute("src", "https://cdn.test/v1/d1.jpg");
  });

  it("opens the photo (lightbox) when the thumbnail is clicked", async () => {
    const onPhotoClick = vi.fn();
    render(<MenuCardContent title="Класично мени" items={[withPhoto]} onPhotoClick={onPhotoClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Погледни фотографија на Шопска салата" }));
    expect(onPhotoClick).toHaveBeenCalledWith("https://cdn.test/v1/d1.jpg", "Шопска салата");
  });

  it("shows no photo button at all for a dish without one", () => {
    render(<MenuCardContent title="Класично мени" items={[withoutPhoto]} onPhotoClick={vi.fn()} />);
    expect(screen.getByText("Леб")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
