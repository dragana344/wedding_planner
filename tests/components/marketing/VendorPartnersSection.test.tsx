import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorPartnersSection } from "@/components/marketing/VendorPartnersSection";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

function make(overrides: Partial<VendorPartner>): VendorPartner {
  return {
    id: "id",
    category: "music",
    name: "Name",
    city: "Скопје",
    short_description: "Опис",
    full_description: null,
    cover_photo_path: null,
    gallery_photo_paths: [],
    phone: null,
    viber_phone: null,
    whatsapp_phone: null,
    website_url: null,
    instagram_url: null,
    facebook_url: null,
    is_featured: false,
    ...overrides,
  };
}

const vendors = [
  make({ id: "1", name: "Алфа Бенд", category: "music" }),
  make({ id: "2", name: "Бета Цвеќара", category: "florist" }),
  make({ id: "3", name: "Гама Цвеќе", category: "florist" }),
];

describe("VendorPartnersSection", () => {
  it("renders nothing without vendors", () => {
    const { container } = render(<VendorPartnersSection vendors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the most-offered categories first, topped up to three tiles", () => {
    render(<VendorPartnersSection vendors={vendors} />);
    const tiles = document.querySelectorAll(".vps-tile");
    expect(Array.from(tiles).map((t) => t.textContent)).toEqual(["Цвеќари", "Музички групи", "Фотографи"]);
  });

  it("keeps the directory folded until the button opens it", async () => {
    render(<VendorPartnersSection vendors={vendors} />);
    expect(screen.queryByText("Алфа Бенд")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Разгледај ги сите услуги/ }));
    expect(screen.getByText("Алфа Бенд")).toBeInTheDocument();
    expect(screen.getByText("Бета Цвеќара")).toBeInTheDocument();
  });

  it("a tile opens the directory filtered to its category", async () => {
    render(<VendorPartnersSection vendors={vendors} />);
    await userEvent.click(screen.getByRole("button", { name: /^Цвеќари/ }));
    expect(screen.getByText("Бета Цвеќара")).toBeInTheDocument();
    expect(screen.queryByText("Алфа Бенд")).not.toBeInTheDocument();
  });
});
