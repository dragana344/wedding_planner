import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { FEATURES } from "@/lib/entitlements/features";
import type { PlanRow } from "@/lib/admin/queries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// vi.mock's factory is hoisted above every top-level statement in this file
// (including plain `const` declarations), so the mocked fns must themselves
// be created inside vi.hoisted — referencing an ordinary top-level const
// from the factory throws "Cannot access '...' before initialization".
const { makeDefaultPlan, updatePlan, setPlanFeatures, deletePlan } = vi.hoisted(() => ({
  makeDefaultPlan: vi.fn(async () => ({ ok: true as const, data: null })),
  updatePlan: vi.fn(async () => ({ ok: true as const, data: null })),
  setPlanFeatures: vi.fn(async () => ({ ok: true as const, data: null })),
  deletePlan: vi.fn(async () => ({ ok: true as const, data: null })),
}));
vi.mock("@/app/admin/(panel)/plans/actions", () => ({ updatePlan, setPlanFeatures, makeDefaultPlan, deletePlan }));

import { PlanAdminPanels } from "@/components/admin/PlanAdminPanels";

// Every switch enabled by default; pass overrides (by feature key) to lock
// specific ones. Limits are irrelevant to this panel's own logic, so they're
// filled with a harmless null.
function planWith(lockedSwitchKeys: string[] = []): PlanRow {
  const features = Object.fromEntries(FEATURES.map((f) => [f.key, { enabled: !lockedSwitchKeys.includes(f.key), limit: null }]));
  return { id: "plan-1", name: "Basic", description: null, sortOrder: 1, isDefault: false, isPublic: false, venueCount: 2, features };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlanAdminPanels — make-default confirmation (review finding)", () => {
  it("warns and requires typing the plan name when a switch feature is locked, then calls makeDefaultPlan", async () => {
    render(<PlanAdminPanels plan={planWith(["seating"])} />);
    expect(
      screen.getByText("Внимание: во ова ниво се заклучени 1 функција (Распоред на седење). Секој нов локал ќе почне без нив.")
    ).toBeInTheDocument();

    const section = screen.getByRole("button", { name: "Направи стандардно" }).closest("div")!;
    // Disabled until the plan name is typed exactly (ConfirmTyped, not window.confirm).
    expect(within(section).getByRole("button", { name: "Направи стандардно" })).toBeDisabled();
    fireEvent.change(within(section).getByLabelText('Напишете „Basic“ за потврда'), { target: { value: "Basic" } });
    fireEvent.click(within(section).getByRole("button", { name: "Направи стандардно" }));
    await waitFor(() => expect(makeDefaultPlan).toHaveBeenCalledWith({ planId: "plan-1" }));
  });

  it("lists every locked switch, in feature-catalogue order, with correct plural", () => {
    render(<PlanAdminPanels plan={planWith(["seating", "budget"])} />);
    expect(
      screen.getByText("Внимание: во ова ниво се заклучени 2 функции (Распоред на седење, Буџет). Секој нов локал ќе почне без нив.")
    ).toBeInTheDocument();
  });

  it("uses the plain window.confirm flow when every switch is enabled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PlanAdminPanels plan={planWith([])} />);
    expect(screen.queryByText(/Внимание:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Направи стандардно" }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(makeDefaultPlan).toHaveBeenCalledWith({ planId: "plan-1" }));
    confirmSpy.mockRestore();
  });

  it("does not call makeDefaultPlan when window.confirm is declined", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PlanAdminPanels plan={planWith([])} />);
    fireEvent.click(screen.getByRole("button", { name: "Направи стандардно" }));
    expect(makeDefaultPlan).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
