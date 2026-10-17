import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasswordResetNotice } from "@/components/venue/shell/PasswordResetNotice";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";

function renderWith(passwordResetNoticeAt: string | null, dismissPasswordResetNotice = vi.fn()) {
  return render(
    <ManagerElevationContext.Provider
      value={{
        managerName: "Марко",
        isOwner: false,
        token: "tok",
        passwordResetNoticeAt,
        elevate: async () => ({ ok: true as const }),
        deAuthorize: () => {},
        dismissPasswordResetNotice,
      }}
    >
      <PasswordResetNotice />
    </ManagerElevationContext.Provider>
  );
}

describe("PasswordResetNotice", () => {
  it("renders nothing when there's no pending notice", () => {
    renderWith(null);
    expect(screen.queryByText(/ресетирана/)).toBeNull();
  });

  it("shows the reset date and dismisses on click", () => {
    const dismiss = vi.fn();
    renderWith("2026-10-10T12:00:00.000Z", dismiss);
    expect(screen.getByText(/ресетирана од поддршка/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Разбирам"));
    expect(dismiss).toHaveBeenCalled();
  });
});
