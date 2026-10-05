// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { FEATURES, FEATURE_KEYS, featureDef, BASIC_TEMPLATE_IDS } from "@/lib/entitlements/features";
import { INVITATION_TEMPLATES } from "@/lib/couple/invitation-templates";

// Keys added after 0048, each by the migration that also extends the check
// constraints and effective_features()'s key list.
const ADDED_LATER: string[] = ["venue_branding"];

describe("feature catalogue (spec §4.1)", () => {
  it("has the 27 features with unique keys and Macedonian labels", () => {
    expect(FEATURE_KEYS).toHaveLength(27);
    expect(new Set(FEATURE_KEYS).size).toBe(27);
    for (const f of FEATURES) expect(f.label.length).toBeGreaterThan(2);
    expect(featureDef("max_guests")).toMatchObject({ scope: "event", kind: "limit" });
    expect(featureDef("reservations")).toMatchObject({ scope: "venue", kind: "switch" });
  });

  it("matches the key list in the database check constraint (migration 0048)", () => {
    const sql = readFileSync("supabase/migrations/0048_plans_and_entitlements.sql", "utf8");
    const listed = sql.match(/feature_key in \(([^)]+)\)/)![1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1));
    expect([...listed, ...ADDED_LATER].sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("treats the non-premium invitation templates as basic", () => {
    expect(BASIC_TEMPLATE_IDS).toEqual(INVITATION_TEMPLATES.filter((t) => !t.premium).map((t) => t.id));
  });

  it("keeps every feature_key check constraint and unnest key list in 0048 in sync with the catalogue", () => {
    const sql = readFileSync("supabase/migrations/0048_plans_and_entitlements.sql", "utf8");
    const parseKeys = (list: string) => list.match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1)).sort();
    // 0048 lists the original catalogue; later migrations extend it.
    const allSorted = FEATURE_KEYS.filter((k) => !ADDED_LATER.includes(k)).sort();
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

  it("the database knows the same basic templates (migration 0063 basic_invitation_templates())", () => {
    const sql = readFileSync("supabase/migrations/0063_basic_invitation_templates.sql", "utf8");
    const listed = sql.match(/select array\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(listed).toEqual([...BASIC_TEMPLATE_IDS]);
  });

  it("0087 extends every venue-scope list with venue_branding and leaves event overrides alone", () => {
    const sql = readFileSync("supabase/migrations/0087_venue_branding.sql", "utf8");
    const parseKeys = (list: string) => list.match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1)).sort();
    const allSorted = [...FEATURE_KEYS].sort();
    for (const table of ["plan_features", "venue_feature_overrides"]) {
      const block = sql.match(new RegExp(`alter table public\\.${table} add constraint[\\s\\S]*?feature_key in \\(([^)]+)\\)`));
      expect(block, `no feature_key check for ${table} in 0087`).not.toBeNull();
      expect(parseKeys(block![1])).toEqual(allSorted);
    }
    const unnest = sql.match(/select unnest\(array\[([^\]]+)\]\)/);
    expect(parseKeys(unnest![1])).toEqual(allSorted);
    expect(sql).not.toMatch(/event_feature_overrides add constraint/);
    expect(featureDef("venue_branding")).toMatchObject({ scope: "venue", kind: "switch" });
  });
});
