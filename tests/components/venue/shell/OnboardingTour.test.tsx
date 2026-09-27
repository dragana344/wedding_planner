import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingTour } from "@/components/venue/shell/OnboardingTour";

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/venue",
  useSearchParams: () => mockSearchParams,
}));

// A stand-in for the real nav links OnboardingTour looks for via
// document.querySelector — present so the component has something to
// measure, matching how it will actually find PanelShell's real nav links.
function renderWithTargets() {
  return render(
    <div>
      <button data-tour="/venue/events">Настани</button>
      <button data-tour="/venue/tables">Распоред на маси</button>
      <button data-tour="/venue/menus">Мени / Пакети</button>
      <OnboardingTour />
    </div>
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  mockSearchParams = new URLSearchParams();
});

describe("OnboardingTour", () => {
  it("renders nothing when the tour query param is absent", () => {
    renderWithTargets();
    expect(screen.queryByText(/следно/i)).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("starts on step 1 when ?tour=1 is present, and strips the param from the URL", () => {
    mockSearchParams = new URLSearchParams("tour=1");
    renderWithTargets();

    expect(screen.getByText(/креирате нов настан/i)).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/venue");
  });

  it("advances through all three steps via Следно, then Заврши ends it", () => {
    mockSearchParams = new URLSearchParams("tour=1");
    renderWithTargets();

    expect(screen.getByText(/креирате нов настан/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /следно/i }));

    expect(screen.getByText(/простории и типови маси/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /следно/i }));

    expect(screen.getByText(/менијата и пакетите/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /заврши/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /заврши/i }));
    expect(screen.queryByText(/менијата и пакетите/i)).not.toBeInTheDocument();
  });

  it("ends immediately when Прескокни is clicked on any step", () => {
    mockSearchParams = new URLSearchParams("tour=1");
    renderWithTargets();

    fireEvent.click(screen.getByRole("button", { name: /прескокни/i }));
    expect(screen.queryByText(/креирате нов настан/i)).not.toBeInTheDocument();
  });
});
