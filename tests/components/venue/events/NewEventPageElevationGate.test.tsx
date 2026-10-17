import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => Promise.resolve({ data: [] });
  return { createBrowserSupabaseClient: () => ({ from: () => chain }) };
});
vi.mock("@/lib/venue/current-venue", () => ({ getCurrentVenueId: async () => "v1" }));

import NewEventPage from "@/app/venue/events/new/page";

describe("NewEventPage — elevation gate (shown before the form, not after submit)", () => {
  it("shows an 'only managers' message instead of the form when not elevated", () => {
    render(
      <ManagerElevationProvider>
        <NewEventPage />
      </ManagerElevationProvider>,
    );
    expect(screen.getByText(/Само менаџер или сопственик може да креира настан/)).toBeInTheDocument();
    expect(screen.queryByText("Се вчитува...")).not.toBeInTheDocument();
  });
});
