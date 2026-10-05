import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FeatureOverridesEditor } from "@/components/admin/FeatureOverridesEditor";
import { FEATURE_KEYS } from "@/lib/entitlements/features";

const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: k !== "seating", limit: k === "max_guests" ? 150 : null }])) as never;

describe("FeatureOverridesEditor", () => {
  it("shows every feature with its resolved value and saves an unlock with a note", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const, data: null }));
    render(<FeatureOverridesEditor scope="event" features={features} overrides={[]} onSave={onSave} />);
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(11);
    fireEvent.change(screen.getByLabelText("Распоред на седење"), { target: { value: "on" } });
    fireEvent.change(screen.getByLabelText("Белешка за Распоред на седење"), { target: { value: "доплата 3000 ден" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај Распоред на седење" }));
    expect(onSave).toHaveBeenCalledWith({ featureKey: "seating", enabled: true, limitOverride: false, limitValue: null, note: "доплата 3000 ден" });
  });

  it("shows all 27 features for venue scope, including venue-only ones", () => {
    const onSave = vi.fn(async () => ({ ok: true as const, data: null }));
    render(<FeatureOverridesEditor scope="venue" features={features} overrides={[]} onSave={onSave} />);
    expect(screen.getByLabelText("Резервации")).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBe(FEATURE_KEYS.length + 1);
  });
});
