import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnerDirectory } from "@/components/vendor-partners/PartnerDirectory";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

function make(overrides: Partial<VendorPartner>): VendorPartner {
  return {
    id: overrides.id ?? "id",
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

const partners: VendorPartner[] = [
  make({ id: "1", name: "Алфа Бенд", category: "music", city: "Скопје" }),
  make({ id: "2", name: "Бета Цвеќара", category: "florist", city: "Битола" }),
];

describe("PartnerDirectory", () => {
  it("shows an empty-state message when there are no vendors at all", () => {
    render(<PartnerDirectory partners={[]} />);
    expect(screen.getByText(/Нема соработници/i)).toBeInTheDocument();
  });

  it("filters by category", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.click(screen.getByRole("button", { name: "Цвеќари" }));
    expect(screen.queryByText("Алфа Бенд")).not.toBeInTheDocument();
    expect(screen.getByText("Бета Цвеќара")).toBeInTheDocument();
  });

  it("only offers category pills for categories that have partners", () => {
    render(<PartnerDirectory partners={partners} />);
    const group = screen.getByRole("group", { name: "Категорија" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Сите", "Музички групи", "Цвеќари"]);
  });

  it("filters by city", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.selectOptions(screen.getByLabelText(/Град/i), "Битола");
    expect(screen.queryByText("Алфа Бенд")).not.toBeInTheDocument();
  });

  it("filters by name search", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.type(screen.getByLabelText(/Пребарај/i), "алфа");
    expect(screen.getByText("Алфа Бенд")).toBeInTheDocument();
    expect(screen.queryByText("Бета Цвеќара")).not.toBeInTheDocument();
  });

  it("shows a no-results message when the filters match nothing", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.type(screen.getByLabelText(/Пребарај/i), "непостоечко");
    expect(screen.getByText(/Нема резултати/i)).toBeInTheDocument();
  });

  it("opens the detail modal when a card is clicked", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.click(screen.getAllByRole("button", { name: /Погледни профил/i })[0]);
    expect(screen.getByRole("heading", { level: 2, name: "Алфа Бенд" })).toBeInTheDocument();
  });
});
