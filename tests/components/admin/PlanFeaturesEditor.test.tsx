import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PlanFeaturesEditor } from "@/components/admin/PlanFeaturesEditor";

type Saved = { featureKey: string; enabled: boolean; limitValue: number | null };
// The param only exists so onSave.mock.calls[0][0] below is typed as
// Saved[] instead of never — the fake implementation itself ignores it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const makeOnSave = () => vi.fn(async (_features: Saved[]) => ({ ok: true as const, data: null }));

describe("PlanFeaturesEditor", () => {
  it("saves every feature with switches and limits", () => {
    const onSave = makeOnSave();
    render(<PlanFeaturesEditor initial={{ invitation: { enabled: true, limit: null } }} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText("Распоред на седење"));
    fireEvent.click(screen.getByLabelText("Максимален број гости"));
    fireEvent.change(screen.getByLabelText("Лимит за Максимален број гости"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    const saved = onSave.mock.calls[0][0];
    expect(saved).toHaveLength(26);
    expect(saved.find((f) => f.featureKey === "seating")!.enabled).toBe(true);
    expect(saved.find((f) => f.featureKey === "max_guests")).toEqual({ featureKey: "max_guests", enabled: true, limitValue: 150 });
  });

  it("warns when a guest/room/event limit is 0 or its feature is off, and clears once enabled with a positive limit", () => {
    const onSave = makeOnSave();
    render(<PlanFeaturesEditor initial={{ max_guests: { enabled: false, limit: null } }} onSave={onSave} />);

    const guestsRow = screen.getByLabelText("Максимален број гости").closest("tr")!;
    // Unchecked (default) → warning shown for this row.
    expect(within(guestsRow).getByText("0 = ништо не е дозволено")).toBeInTheDocument();

    // Enable it but leave the limit at 0 → still warns.
    fireEvent.click(within(guestsRow).getByLabelText("Максимален број гости"));
    fireEvent.change(within(guestsRow).getByLabelText("Лимит за Максимален број гости"), { target: { value: "0" } });
    expect(within(guestsRow).getByText("0 = ништо не е дозволено")).toBeInTheDocument();

    // A positive limit while enabled clears the warning for this row.
    fireEvent.change(within(guestsRow).getByLabelText("Лимит за Максимален број гости"), { target: { value: "150" } });
    expect(within(guestsRow).queryByText("0 = ништо не е дозволено")).not.toBeInTheDocument();

    // max_rooms/max_active_events were never in `initial`, so they default
    // to unchecked and still warn independently of the guests row above.
    const roomsRow = screen.getByLabelText("Максимален број простории").closest("tr")!;
    expect(within(roomsRow).getByText("0 = ништо не е дозволено")).toBeInTheDocument();
  });
});
