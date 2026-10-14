import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackButton } from "@/components/admin/BackButton";

const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack }),
}));

beforeEach(() => {
  mockBack.mockReset();
});

describe("BackButton", () => {
  it("always goes back through real browser history", () => {
    // No history.length heuristic: that check was unreliable (almost
    // always true after bouncing through /admin/login → mfa), and could
    // send an admin back to a login/MFA screen instead of a list page.
    render(<BackButton label="Назад кон локали" />);
    fireEvent.click(screen.getByRole("button", { name: "Назад кон локали" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
