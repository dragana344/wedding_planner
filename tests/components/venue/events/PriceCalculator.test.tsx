import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PriceCalculator } from "@/components/venue/events/PriceCalculator";

describe("PriceCalculator", () => {
  it("defaults to the per-guest tab, pre-filled with the wizard's guest count", async () => {
    render(<PriceCalculator guestCount={50} onApply={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Калкулатор/i }));
    expect(screen.getByLabelText("Број на гости")).toHaveValue(50);
  });

  it("multiplies price-per-guest by guest count and applies the total", async () => {
    const onApply = vi.fn();
    render(<PriceCalculator guestCount={50} onApply={onApply} />);
    await userEvent.click(screen.getByRole("button", { name: /Калкулатор/i }));
    await userEvent.type(screen.getByLabelText("Цена по гостин"), "1200");
    expect(screen.getByText("60.000 МКД")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Примени во вкупна цена" }));
    expect(onApply).toHaveBeenCalledWith(60000);
  });

  it("the keypad tab does basic arithmetic and applies the result", async () => {
    const onApply = vi.fn();
    render(<PriceCalculator guestCount={10} onApply={onApply} />);
    await userEvent.click(screen.getByRole("button", { name: /Калкулатор/i }));
    await userEvent.click(screen.getByRole("tab", { name: "Калкулатор" }));
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    await userEvent.click(screen.getByRole("button", { name: "0" }));
    await userEvent.click(screen.getByRole("button", { name: "0" }));
    await userEvent.click(screen.getByRole("button", { name: "×" }));
    await userEvent.click(screen.getByRole("button", { name: "3" }));
    await userEvent.click(screen.getByRole("button", { name: "=" }));
    expect(screen.getByText("1500")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Примени во вкупна цена" }));
    expect(onApply).toHaveBeenCalledWith(1500);
  });
});
