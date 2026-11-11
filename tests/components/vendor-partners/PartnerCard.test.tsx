import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnerCard } from "@/components/vendor-partners/PartnerCard";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

const base: VendorPartner = {
  id: "v1",
  category: "music",
  name: "Бенд Весели Моменти",
  city: "Скопје",
  short_description: "Свадбена музика",
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
};

describe("PartnerCard", () => {
  it("keeps contacts off the tile — they live in the profile", () => {
    render(<PartnerCard partner={{ ...base, phone: "070123456", website_url: "https://example.mk" }} onOpen={vi.fn()} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Музички групи")).toBeInTheDocument();
    expect(screen.getByText("Скопје")).toBeInTheDocument();
  });

  it("calls onOpen with the partner when clicked", async () => {
    const onOpen = vi.fn();
    render(<PartnerCard partner={base} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /Погледни профил/i }));
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("shows a featured badge only when is_featured is true", () => {
    const { rerender } = render(<PartnerCard partner={base} onOpen={vi.fn()} />);
    expect(screen.queryByText("Спонзорирано")).not.toBeInTheDocument();
    rerender(<PartnerCard partner={{ ...base, is_featured: true }} onOpen={vi.fn()} />);
    expect(screen.getByText("Спонзорирано")).toBeInTheDocument();
  });
});
