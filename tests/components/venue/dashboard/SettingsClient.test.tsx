import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsClient } from "@/components/venue/dashboard/SettingsClient";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("SettingsClient — owner-only gate", () => {
  it("shows an owner-only message instead of the settings content when not elevated as owner", () => {
    render(
      <ManagerElevationProvider>
        <SettingsClient venueName="Sala Biser" email="owner@example.com" />
      </ManagerElevationProvider>
    );
    expect(screen.getByText("Оваа страница е достапна само за сопственикот.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/внесете го името на локалот/i)).not.toBeInTheDocument();
  });
});
