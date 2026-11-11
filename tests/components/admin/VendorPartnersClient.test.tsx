import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorPartnersClient } from "@/components/admin/VendorPartnersClient";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

const { createVendorPartner, deleteVendorPartner } = vi.hoisted(() => ({
  createVendorPartner: vi.fn().mockResolvedValue({ ok: true, data: { id: "new-id" } }),
  deleteVendorPartner: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));
vi.mock("@/app/admin/(panel)/vendors/actions", () => ({
  createVendorPartner,
  updateVendorPartner: vi.fn(),
  deleteVendorPartner,
  uploadVendorPartnerPhoto: vi.fn(),
  removeVendorPartnerGalleryPhoto: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const vendors: VendorPartner[] = [
  {
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
  },
];

describe("VendorPartnersClient", () => {
  it("lists existing vendors", () => {
    render(<VendorPartnersClient vendors={vendors} />);
    expect(screen.getByText("Бенд Весели Моменти")).toBeInTheDocument();
  });

  it("creates a new vendor from the add form", async () => {
    render(<VendorPartnersClient vendors={vendors} />);
    await userEvent.click(screen.getByRole("button", { name: /Додади соработник/i }));
    await userEvent.type(screen.getByLabelText(/^Име/i), "Нов Соработник");
    await userEvent.type(screen.getByLabelText(/^Град/i), "Велес");
    await userEvent.type(screen.getByLabelText(/Краток опис/i), "Опис");
    await userEvent.click(screen.getByRole("button", { name: /Зачувај/i }));
    expect(createVendorPartner).toHaveBeenCalledWith(expect.objectContaining({ name: "Нов Соработник", city: "Велес" }));
  });

  it("deletes a vendor after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<VendorPartnersClient vendors={vendors} />);
    await userEvent.click(screen.getByRole("button", { name: /Избриши/i }));
    expect(deleteVendorPartner).toHaveBeenCalledWith({ vendorId: "v1" });
  });

  it("warns that photos go live as soon as they're uploaded", async () => {
    render(<VendorPartnersClient vendors={vendors} />);
    await userEvent.click(screen.getByRole("button", { name: /Уреди/i }));
    expect(screen.getByText("Фотографиите стануваат видливи на платформата веднаш штом се прикачени.")).toBeInTheDocument();
  });
});
