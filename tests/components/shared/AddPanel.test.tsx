import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddPanel } from "@/components/shared/AddPanel";

describe("AddPanel", () => {
  it("starts collapsed and opens/closes its form from the header button", async () => {
    render(
      <AddPanel title="Додади ставка">
        <label htmlFor="n">Име</label>
        <input id="n" />
      </AddPanel>,
    );
    const toggle = screen.getByRole("button", { name: "Додади ставка" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Име")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Име")).toBeInTheDocument();
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toContainElement(screen.getByLabelText("Име"));

    await userEvent.click(toggle);
    expect(screen.queryByLabelText("Име")).not.toBeInTheDocument();
  });

  it("can start open, e.g. while the list is still empty", () => {
    render(
      <AddPanel title="Додади задача" defaultOpen>
        <p>форма</p>
      </AddPanel>,
    );
    expect(screen.getByRole("button", { name: "Додади задача" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("форма")).toBeInTheDocument();
  });
});
