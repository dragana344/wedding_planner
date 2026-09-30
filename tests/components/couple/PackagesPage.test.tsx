import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FEATURE_KEYS, type FeatureMap } from "@/lib/entitlements/features";

function fullMap(overrides: Partial<FeatureMap>): FeatureMap {
  const base = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: true, limit: null }])) as FeatureMap;
  return { ...base, ...overrides };
}

vi.mock("@/lib/entitlements/packages", () => ({
  listPackagesForDisplay: vi.fn(async () => [
    {
      id: "p1",
      name: "START",
      description: "Бесплатно, го обезбедува ресторанот. Фото и видео се чуваат 15 дена.",
      features: fullMap({
        budget: { enabled: false, limit: 0 },
        max_guests: { enabled: true, limit: 150 },
      }),
    },
    {
      id: "p2",
      name: "PREMIUM",
      description: "20 GB · 2.000 ден. · чување 30 дена · преземање во оригинален квалитет",
      features: fullMap({
        budget: { enabled: true, limit: null },
        max_guests: { enabled: true, limit: null },
      }),
    },
  ]),
}));

import PackagesPage from "@/app/couple/(protected)/packages/page";

describe("packages page (couple, read-only)", () => {
  it("lists every package with its description and feature marks, and no payment UI", async () => {
    render(await PackagesPage());

    expect(screen.getByText("START")).toBeInTheDocument();
    expect(screen.getByText("PREMIUM")).toBeInTheDocument();
    expect(screen.getByText(/Бесплатно, го обезбедува ресторанот/)).toBeInTheDocument();
    expect(screen.getByText(/20 GB · 2.000 ден/)).toBeInTheDocument();

    // switch-kind feature: locked on START, unlocked on PREMIUM.
    expect(screen.getAllByText("Заклучено").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Вклучено").length).toBeGreaterThan(0);
    // limit-kind feature: a numeric limit and "unlimited" both render.
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getAllByText("Неограничено").length).toBeGreaterThan(0);

    expect(screen.queryByRole("button", { name: /плати|купи/i })).toBeNull();
    expect(screen.getByText("За активирање контактирајте го вашиот ресторан.")).toBeInTheDocument();
  });
});
