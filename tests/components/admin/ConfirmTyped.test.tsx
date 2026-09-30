import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmTyped } from "@/components/admin/ConfirmTyped";

describe("ConfirmTyped", () => {
  it("enables the action only when the text matches exactly", () => {
    const onConfirm = vi.fn();
    render(<ConfirmTyped expected="Сала Езеро" label="Избриши сметка" onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: "Избриши сметка" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Напишете „Сала Езеро“ за потврда"), { target: { value: "сала езеро" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Напишете „Сала Езеро“ за потврда"), { target: { value: "Сала Езеро" } });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("Сала Езеро");
  });

  it("disables the input and the button while pending, even with a matching value", () => {
    const onConfirm = vi.fn();
    render(<ConfirmTyped expected="Сала Езеро" label="Избриши сметка" onConfirm={onConfirm} pending />);
    fireEvent.change(screen.getByLabelText("Напишете „Сала Езеро“ за потврда"), { target: { value: "Сала Езеро" } });
    expect(screen.getByLabelText("Напишете „Сала Езеро“ за потврда")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Избриши сметка" })).toBeDisabled();
  });
});
