import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/lib/vendor-partners/photo-url", () => ({ getVendorPartnerPhotoUrl: (p: string | null) => (p ? `https://cdn.test/${p}` : null) }));

import { PartnerDetailModal } from "@/components/vendor-partners/PartnerDetailModal";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

const partner: VendorPartner = {
  id: "v1",
  category: "music",
  name: "Бенд Весели Моменти",
  city: "Скопје",
  short_description: "Свадбена музика",
  full_description: "Жива музика за свадби.",
  cover_photo_path: null,
  gallery_photo_paths: [],
  phone: "070123456",
  viber_phone: null,
  whatsapp_phone: null,
  website_url: "https://example.mk",
  instagram_url: null,
  facebook_url: null,
  is_featured: false,
};

describe("PartnerDetailModal", () => {
  it("shows the profile as a dialog with only the filled-in contacts", () => {
    render(<PartnerDetailModal partner={partner} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Бенд Весели Моменти" })).toBeInTheDocument();
    expect(screen.getByText("Жива музика за свадби.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /070123456/ })).toHaveAttribute("href", "tel:070123456");
    expect(screen.getByRole("link", { name: /Веб-страница/ })).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: /Instagram/ })).not.toBeInTheDocument();
  });

  it("closes from the × button, the backdrop and Escape, but not from a click inside", async () => {
    const onClose = vi.fn();
    render(<PartnerDetailModal partner={partner} onClose={onClose} />);
    await userEvent.click(screen.getByText("Жива музика за свадби."));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Затвори" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(document.querySelector(".pv-modal-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("flips the hero between the cover and gallery photos with the dots", async () => {
    render(<PartnerDetailModal partner={{ ...partner, cover_photo_path: "c.jpg", gallery_photo_paths: ["g1.jpg", "g2.jpg"] }} onClose={vi.fn()} />);
    const dots = screen.getAllByRole("button", { name: /^Фотографија/ });
    expect(dots).toHaveLength(3);
    await userEvent.click(dots[2]);
    expect(dots[2]).toHaveClass("on");
    expect(screen.getByText("Галерија")).toBeInTheDocument();
  });

  it("keeps the gallery section, with a note, when there are no photos yet", () => {
    render(<PartnerDetailModal partner={partner} onClose={vi.fn()} />);
    expect(screen.getByText("Галерија")).toBeInTheDocument();
    expect(screen.getByText("Партнерот сè уште нема додадено фотографии.")).toBeInTheDocument();
  });

  it("locks the page scroll while open", () => {
    const { unmount } = render(<PartnerDetailModal partner={partner} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
