import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayDots } from "@/components/venue/dashboard/DayDots";

describe("DayDots", () => {
  it("draws one dot per event in its room color, up to three, then a plus", () => {
    const { container, rerender } = render(<DayDots colors={["#c9992f"]} />);
    expect(container.querySelectorAll(".mc-dot")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "1 настан" })).not.toHaveClass("is-multi");

    rerender(<DayDots colors={["#c9992f", "#2563eb"]} />);
    const dots = [...container.querySelectorAll(".mc-dot")] as HTMLElement[];
    expect(dots.map((d) => d.style.background)).toEqual(["rgb(201, 153, 47)", "rgb(37, 99, 235)"]);
    expect(screen.getByRole("img", { name: "2 настани" })).toHaveClass("is-multi");

    rerender(<DayDots colors={["#a", "#b", "#c", "#d", "#e"].map(() => "#2563eb")} />);
    expect(container.querySelectorAll(".mc-dot")).toHaveLength(3);
    expect(container.querySelector(".mc-more")).toHaveTextContent("+");
  });

  it("renders nothing for a day without events", () => {
    const { container } = render(<DayDots colors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
