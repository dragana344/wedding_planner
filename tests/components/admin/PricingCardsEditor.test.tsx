import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
vi.mock("@/app/admin/(panel)/pricing/actions", () => ({
  createPricingCard: vi.fn(),
  updatePricingCard: vi.fn(),
  deletePricingCard: vi.fn(),
}));

import { PricingCardsEditor } from "@/components/admin/PricingCardsEditor";
import type { PricingCardRow } from "@/lib/admin/queries";

const cards: PricingCardRow[] = [
  { id: "c1", name: "START", price: "Бесплатно", period: null, features: ["Основни функции"], isFeatured: false, isPublished: true, sortOrder: 10 },
  { id: "c2", name: "PREMIUM", price: "2.000 ден", period: "/ месечно", features: ["Сè"], isFeatured: true, isPublished: false, sortOrder: 20 },
];

describe("PricingCardsEditor", () => {
  it("labels each existing card with its own name, so stacked cards aren't mistaken for one form", () => {
    render(<PricingCardsEditor cards={cards} />);
    expect(screen.getByText("START")).toBeInTheDocument();
    expect(screen.getByText("PREMIUM")).toBeInTheDocument();
  });

  it("marks a featured/published card and an unpublished one distinctly", () => {
    render(<PricingCardsEditor cards={cards} />);
    const startHeading = screen.getByText("START").closest("div")!;
    expect(within(startHeading).getByText("Објавено")).toHaveClass("p-ok");
    expect(within(startHeading).queryByText("Препорачано")).not.toBeInTheDocument();

    const premiumHeading = screen.getByText("PREMIUM").closest("div")!;
    expect(within(premiumHeading).getByText("Препорачано")).toHaveClass("p-ok");
    expect(within(premiumHeading).getByText("Необјавено")).toHaveClass("p-bad");
  });

  it("shows no card-identity header on the empty 'new card' form", () => {
    render(<PricingCardsEditor cards={cards} />);
    expect(screen.getByText("Нова картичка")).toBeInTheDocument();
    // Only the two existing cards get a name header — the new-card form's
    // own name input starts blank, so there's nothing yet to label it with.
    expect(screen.getAllByText("Објавено").length + screen.getAllByText("Необјавено").length).toBe(2);
  });
});
