import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

// app/venue/layout.tsx: a venue the admin just opened sees its own-password
// screen first, then the Terms screen, and only then the panel.

let user: { id: string; app_metadata: Record<string, unknown> } | null = null;
let venueRow: { deletion_scheduled_for: string | null; terms_version: string | null } | null = null;
let venueRowError: { message: string } | null = null;
let access: Record<string, unknown> = { status: "ok", venue: { id: "venue-1", name: "Сала Езеро" } };

const supabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: venueRow, error: venueRowError }) }) }),
  }),
};

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => supabase }));
vi.mock("@/lib/venue/venue-access", () => ({
  getVenueAccess: async () => access,
}));
vi.mock("@/lib/entitlements/server", () => ({
  getVenueFeatures: async () => new Proxy({}, { get: () => ({ enabled: true }) }),
}));
vi.mock("@/lib/venue/branding", () => ({ getVenueBranding: async () => null }));
vi.mock("@/lib/venue/unseen-changes", () => ({ listUnseenSections: async () => new Set() }));
vi.mock("@/lib/venue/notifications", () => ({ listVenueNotifications: async () => [] }));
vi.mock("@/lib/log", () => ({ log: vi.fn(), errorFields: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/venue/onboarding", async () => {
  const facts = await import("@/lib/legal/facts");
  return {
    venueOwnerName: vi.fn(async () => "Марија"),
    onboardingStep: (u: { app_metadata?: Record<string, unknown> } | null, v: string | null | undefined) =>
      u?.app_metadata?.must_change_password === true ? "password" : v == null ? "terms" : null,
    termsUpdatePending: (v: string | null | undefined) => v != null && v !== facts.LEGAL_VERSION,
  };
});
vi.mock("@/components/venue/shell/PanelShell", () => ({ PanelShell: () => null }));
vi.mock("@/components/venue/BlockedScreen", () => ({ BlockedScreen: () => null }));
vi.mock("@/components/venue/onboarding/FirstLoginPassword", () => ({ FirstLoginPassword: () => null }));
vi.mock("@/components/venue/onboarding/TermsAcceptance", () => ({ TermsAcceptance: () => null }));

import VenueLayout from "@/app/venue/layout";
import { PanelShell } from "@/components/venue/shell/PanelShell";
import { BlockedScreen } from "@/components/venue/BlockedScreen";
import { venueOwnerName } from "@/lib/venue/onboarding";
import { FirstLoginPassword } from "@/components/venue/onboarding/FirstLoginPassword";
import { TermsAcceptance } from "@/components/venue/onboarding/TermsAcceptance";
import { LEGAL_VERSION } from "@/lib/legal/facts";

async function render(): Promise<ReactElement<Record<string, unknown>>> {
  const el = await VenueLayout({ children: null });
  if (!isValidElement(el)) throw new Error("layout returned no element");
  return el as ReactElement<Record<string, unknown>>;
}

beforeEach(() => {
  user = { id: "user-1", app_metadata: {} };
  venueRow = { deletion_scheduled_for: null, terms_version: LEGAL_VERSION };
  venueRowError = null;
  access = { status: "ok", venue: { id: "venue-1", name: "Сала Езеро" } };
  vi.mocked(venueOwnerName).mockResolvedValue("Марија");
});

describe("venue layout: first-login gate", () => {
  it("shows the own-password screen while the admin-generated password is still in use", async () => {
    user = { id: "user-1", app_metadata: { must_change_password: true } };
    venueRow = { deletion_scheduled_for: null, terms_version: null };
    expect((await render()).type).toBe(FirstLoginPassword);
  });

  it("shows the Terms screen when the venue never accepted them", async () => {
    venueRow = { deletion_scheduled_for: null, terms_version: null };
    const el = await render();
    expect(el.type).toBe(TermsAcceptance);
    expect(el.props).toMatchObject({ venueName: "Сала Езеро", ownerName: "Марија" });
  });

  it("a newer Terms version never blocks the panel: it opens with the update banner", async () => {
    venueRow = { deletion_scheduled_for: null, terms_version: "0.9" };
    const el = await render();
    expect(el.type).toBe(PanelShell);
    expect(el.props.termsUpdatePending).toBe(true);
  });

  it("opens the panel once both are done", async () => {
    const el = await render();
    expect(el.type).toBe(PanelShell);
    expect(el.props.venueName).toBe("Сала Езеро");
    expect(el.props.termsUpdatePending).toBe(false);
  });

  it("does not lock the venue out of its panel when the venue row can't be read", async () => {
    venueRow = null;
    venueRowError = { message: "boom" };
    expect((await render()).type).toBe(PanelShell);
  });
});

describe("venue layout: blocked venue (0172)", () => {
  it("shows the scheduled deletion date and, with an owner login, the export", async () => {
    access = { status: "blocked", reason: "неплатено", venueId: "venue-1", deletionScheduledFor: "2026-12-04T10:00:00Z" };
    const el = await render();
    expect(el.type).toBe(BlockedScreen);
    expect(el.props).toEqual({ reason: "неплатено", deletionScheduledFor: "2026-12-04T10:00:00Z", hasOwner: true });
  });

  it("without an owner login the export form is left out; without a scheduled deletion nothing is looked up", async () => {
    access = { status: "blocked", reason: null, venueId: "venue-1", deletionScheduledFor: "2026-12-04T10:00:00Z" };
    vi.mocked(venueOwnerName).mockResolvedValue(null);
    expect((await render()).props).toMatchObject({ hasOwner: false });
    vi.mocked(venueOwnerName).mockClear();
    access = { status: "blocked", reason: null, venueId: "venue-1", deletionScheduledFor: null };
    expect((await render()).props).toMatchObject({ deletionScheduledFor: null, hasOwner: false });
    expect(venueOwnerName).not.toHaveBeenCalled();
  });
});
