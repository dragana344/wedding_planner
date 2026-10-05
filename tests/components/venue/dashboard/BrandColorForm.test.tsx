import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const lib = vi.hoisted(() => ({ updateVenueBrandColor: vi.fn() }));
vi.mock("@/lib/venue/venue-profile", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));

import { BrandColorForm } from "@/components/venue/dashboard/BrandColorForm";
import { BrandMark } from "@/components/venue/shell/BrandMark";

beforeEach(() => {
  vi.clearAllMocks();
  lib.updateVenueBrandColor.mockResolvedValue(undefined);
});

describe("BrandColorForm (branding, 0087)", () => {
  it("saves the picked colour and repaints the panel", async () => {
    render(<BrandColorForm venueId="v1" color={null} enabled />);
    fireEvent.change(screen.getByLabelText("Боја на локалот"), { target: { value: "#0e9f95" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај боја" }));
    await waitFor(() => expect(lib.updateVenueBrandColor).toHaveBeenCalledWith("v1", "#0e9f95"));
    expect(await screen.findByText("Бојата е зачувана.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("offers to go back to the standard colour only when one is set", async () => {
    const { unmount } = render(<BrandColorForm venueId="v1" color={null} enabled />);
    expect(screen.queryByRole("button", { name: "Врати ја стандардната" })).not.toBeInTheDocument();
    unmount();
    render(<BrandColorForm venueId="v1" color="#7b3aed" enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Врати ја стандардната" }));
    await waitFor(() => expect(lib.updateVenueBrandColor).toHaveBeenCalledWith("v1", null));
  });

  it("explains a locked plan and saves nothing", () => {
    render(<BrandColorForm venueId="v1" color={null} enabled={false} />);
    expect(screen.getByText(/Брендирањето не е вклучено во вашиот пакет/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Зачувај боја" })).toBeDisabled();
    expect(screen.getByLabelText("Боја на локалот")).toBeDisabled();
  });

  it("shows the reason when saving fails", async () => {
    lib.updateVenueBrandColor.mockRejectedValue(new Error("Изберете боја во облик #rrggbb."));
    render(<BrandColorForm venueId="v1" color={null} enabled />);
    fireEvent.click(screen.getByRole("button", { name: "Зачувај боја" }));
    expect(await screen.findByText("Изберете боја во облик #rrggbb.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("BrandMark", () => {
  it("shows the venue's logo when there is one, otherwise the platform mark", () => {
    const { container, rerender } = render(<BrandMark logoUrl="https://cdn.test/v1/logo.png" />);
    expect(container.querySelector("img.mark-logo")?.getAttribute("src")).toBe("https://cdn.test/v1/logo.png");
    rerender(<BrandMark logoUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg.mark")).not.toBeNull();
  });
});
