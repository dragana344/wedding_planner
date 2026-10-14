import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RangePanel } from "@/components/shared/RangePanel";

const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  mockReplace.mockReset();
  mockPush.mockReset();
});

describe("RangePanel", () => {
  it("stays closed until the arrow is clicked, when no range is active", () => {
    render(
      <RangePanel title="Регистрации по период" fromName="signupsFrom" toName="signupsTo" isOpen={false} resetHref="/admin" resetLabel="Избери друг период">
        <p>резултати</p>
      </RangePanel>
    );
    expect(screen.queryByText("резултати")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Избери период/ }));
    expect(screen.getByText("резултати")).toBeInTheDocument();
    expect(screen.getByLabelText("Од датум")).toBeRequired();
    // "До датум" is deliberately optional — the server defaults a blank
    // one to today, so picking just a start date alone still searches.
    expect(screen.getByLabelText(/До датум/)).not.toBeRequired();
  });

  it("opens pre-filled and shows the reset link when a range is already active", () => {
    render(
      <RangePanel
        title="Регистрации по период"
        fromName="signupsFrom"
        toName="signupsTo"
        defaultFrom="2028-01-01"
        defaultTo="2028-01-31"
        isOpen={true}
        resetHref="/admin"
        resetLabel="Избери друг период"
      >
        <p>резултати за период</p>
      </RangePanel>
    );
    expect(screen.getByText("резултати за период")).toBeInTheDocument();
    expect(screen.getByLabelText("Од датум")).toHaveValue("2028-01-01");
    expect(screen.getByLabelText(/До датум/)).toHaveValue("2028-01-31");
    expect(screen.getByRole("link", { name: "Избери друг период" })).toHaveAttribute("href", "/admin");
  });

  it("closes again when the modal's close button is clicked", () => {
    render(
      <RangePanel title="Регистрации по период" fromName="signupsFrom" toName="signupsTo" isOpen={true} resetHref="/admin" resetLabel="Избери друг период">
        <p>резултати</p>
      </RangePanel>
    );
    expect(screen.getByText("резултати")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Затвори" }));
    expect(screen.queryByText("резултати")).not.toBeInTheDocument();
  });
});
