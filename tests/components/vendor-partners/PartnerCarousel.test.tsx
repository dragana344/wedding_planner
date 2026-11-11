import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnerCarousel } from "@/components/vendor-partners/PartnerCarousel";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

function make(i: number): VendorPartner {
  return {
    id: `p${i}`,
    category: "music",
    name: `Партнер ${i}`,
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
  };
}

// jsdom has no layout: a 1000px track with 200px slides (5 per view).
const originals = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft"),
  clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth"),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement ? Array.from(this.parentElement.children).indexOf(this) * 200 : 0;
    },
  });
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get: () => 1000 });
});
afterAll(() => {
  for (const [key, desc] of Object.entries(originals)) {
    if (desc) Object.defineProperty(key === "clientWidth" ? Element.prototype : HTMLElement.prototype, key, desc);
  }
});

describe("PartnerCarousel", () => {
  it("pages through five cards at a time with arrows and dots", async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as never;
    render(<PartnerCarousel partners={Array.from({ length: 12 }, (_, i) => make(i + 1))} onOpen={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: /^Страна/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Претходни" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Следни" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1000, behavior: "smooth" });
    expect(screen.getByRole("button", { name: "Страна 2" })).toHaveClass("on");

    await userEvent.click(screen.getByRole("button", { name: "Страна 3" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 2000, behavior: "smooth" });
    expect(screen.getByRole("button", { name: "Следни" })).toBeDisabled();
  });

  it("shows no navigation when everything fits in one view", () => {
    render(<PartnerCarousel partners={[make(1), make(2)]} onOpen={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Следни" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });
});

describe("PartnerCarousel with many pages", () => {
  it("swaps the dots for a page counter past seven pages", () => {
    render(<PartnerCarousel partners={Array.from({ length: 40 }, (_, i) => make(i + 1))} onOpen={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Страна/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 / 8")).toBeInTheDocument();
  });
});
