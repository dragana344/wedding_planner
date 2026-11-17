import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "@/components/admin/FilterBar";

describe("FilterBar", () => {
  it("starts folded with no filters applied and opens from the 'Филтри' button", () => {
    const { container } = render(
      <FilterBar activeCount={0}>
        <form />
      </FilterBar>,
    );
    const toggle = screen.getByRole("button", { name: /Филтри/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.firstChild).not.toHaveClass("is-open");
    fireEvent.click(toggle);
    expect(container.firstChild).toHaveClass("is-open");
  });

  it("starts open and shows the count when filters are applied", () => {
    render(
      <FilterBar activeCount={2}>
        <form />
      </FilterBar>,
    );
    expect(screen.getByRole("button", { name: /Филтри/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
