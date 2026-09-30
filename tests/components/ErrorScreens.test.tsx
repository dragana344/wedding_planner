import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";

vi.mock("@/lib/report-error", () => ({ reportClientError: vi.fn() }));

describe("error and 404 pages (REL-003)", () => {
  it("renders the app's own 404 with a way home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Страницата не е пронајдена" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Почетна страница" })).toHaveAttribute("href", "/");
  });

  it("renders the error page, reports the error and lets the user retry", async () => {
    const { reportClientError } = await import("@/lib/report-error");
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Нешто тргна наопаку" })).toBeInTheDocument();
    expect(screen.getByText("Референца: abc123")).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith(error);
    await userEvent.click(screen.getByRole("button", { name: "Обиди се повторно" }));
    expect(reset).toHaveBeenCalled();
  });
});
