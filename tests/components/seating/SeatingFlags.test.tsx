import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeatingFlags } from "@/components/seating/SeatingFlags";

describe("SeatingFlags (0181)", () => {
  it("shows the count at the top and a line per guest", () => {
    render(
      <SeatingFlags
        flags={[
          { guestId: "g1", fullName: "Ана", kind: "over", extra: 3, text: "3 места повеќе на маса 5" },
          { guestId: "g2", fullName: "Марко", kind: "declined", extra: 2, text: "Одбил — ослободете ги местата на маса 2" },
        ]}
      />,
    );
    expect(screen.getByText("2 гости на распоредот треба да се проверат")).toBeInTheDocument();
    expect(screen.getByText("Ана: 3 места повеќе на маса 5")).toBeInTheDocument();
    expect(screen.getByText("Марко: Одбил — ослободете ги местата на маса 2")).toBeInTheDocument();
  });

  it("shows nothing when every seated guest fits", () => {
    const { container } = render(<SeatingFlags flags={[]} />);
    expect(container).toBeEmptyDOMElement();
    const { container: none } = render(<SeatingFlags flags={undefined} />);
    expect(none).toBeEmptyDOMElement();
  });
});
