// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { FEATURES, FEATURE_KEYS, featureDef, BASIC_TEMPLATE_IDS } from "@/lib/entitlements/features";
import { INVITATION_TEMPLATES } from "@/lib/couple/invitation-templates";

describe("feature catalogue (spec §4.1)", () => {
  it("has the 26 features with unique keys and Macedonian labels", () => {
    expect(FEATURE_KEYS).toHaveLength(26);
    expect(new Set(FEATURE_KEYS).size).toBe(26);
    for (const f of FEATURES) expect(f.label.length).toBeGreaterThan(2);
    expect(featureDef("max_guests")).toMatchObject({ scope: "event", kind: "limit" });
    expect(featureDef("reservations")).toMatchObject({ scope: "venue", kind: "switch" });
  });

  it("matches the key list in the database check constraint (migration 0048)", () => {
    const sql = readFileSync("supabase/migrations/0048_plans_and_entitlements.sql", "utf8");
    const listed = sql.match(/feature_key in \(([^)]+)\)/)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect([...listed].sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("treats the first two invitation templates as basic", () => {
    expect(BASIC_TEMPLATE_IDS).toEqual(INVITATION_TEMPLATES.slice(0, 2).map((t) => t.id));
  });

  it("keeps every feature_key check constraint and unnest key list in 0048 in sync with the catalogue", () => {
    const sql = readFileSync("supabase/migrations/0048_plans_and_entitlements.sql", "utf8");
    const parseKeys = (list: string) => list.match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1)).sort();
    const allSorted = [...FEATURE_KEYS].sort();
    const eventScopeSorted = FEATURES.filter((f) => f.scope === "event").map((f) => f.key).sort();

    // `feature_key in (...)` check constraints: plan_features and
    // venue_feature_overrides accept the full catalogue; event_feature_overrides
    // is event-scope only (a venue-scope key like `reservations` makes no
    // sense as a per-event override).
    const tableChecks: Record<string, string[]> = {};
    for (const table of ["plan_features", "venue_feature_overrides", "event_feature_overrides"]) {
      const block = sql.match(new RegExp(`create table public\\.${table}[\\s\\S]*?feature_key in \\(([^)]+)\\)`));
      expect(block, `no feature_key check found for ${table}`).not.toBeNull();
      tableChecks[table] = parseKeys(block![1]);
    }
    expect(tableChecks.plan_features).toEqual(allSorted);
    expect(tableChecks.venue_feature_overrides).toEqual(allSorted);
    expect(tableChecks.event_feature_overrides).toEqual(eventScopeSorted);

    // `unnest(array[...])` key lists: the default-plan seed insert and the
    // `effective_features` resolution CTE. Both iterate the full catalogue.
    const unnestLists = [...sql.matchAll(/unnest\(array\[([^\]]+)\]\)/g)].map((m) => parseKeys(m[1]));
    expect(unnestLists, "expected exactly 2 unnest(array[...]) key lists in 0048").toHaveLength(2);
    for (const list of unnestLists) expect(list).toEqual(allSorted);
  });

  it("the database knows the same basic templates (migration 0049)", () => {
    const sql = readFileSync("supabase/migrations/0049_entitlement_enforcement.sql", "utf8");
    const listed = sql.match(/v_basic text\[\] := array\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(listed).toEqual([...BASIC_TEMPLATE_IDS]);
  });
});
