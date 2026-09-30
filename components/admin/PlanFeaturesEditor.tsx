"use client";

import { useState } from "react";
import { FEATURES, type FeatureKey } from "@/lib/entitlements/features";
import type { ActionResult } from "@/lib/admin/actions";

type Value = { enabled: boolean; limit: string };

// These three limits gate every room, active event and guest a venue can
// have at all (spec §4.2/D-earlier ruling: a disabled or 0-value limit
// feature means 0, not unlimited) — leaving one of them off or at 0 on a
// plan would lock every venue on it out of rooms/events/guests entirely.
// PlanDetailsForm/plan-actions-core don't refuse this (an admin may
// deliberately want a 0-guest holding plan), so the editor only warns.
const ZERO_BLOCKS_EVERYTHING: ReadonlySet<FeatureKey> = new Set(["max_guests", "max_rooms", "max_active_events"]);
const ZERO_WARNING = "0 = ништо не е дозволено";

// Editor for one plan's full feature/limit set (task 3.4, spec §4.2): every
// plan carries all 26 rows (unlike venue/event overrides, which are sparse),
// so this always saves the complete FEATURES array in one call.
export function PlanFeaturesEditor({
  initial,
  onSave,
}: {
  initial: Record<string, { enabled: boolean; limit: number | null }>;
  onSave: (f: { featureKey: FeatureKey; enabled: boolean; limitValue: number | null }[]) => Promise<ActionResult<null>>;
}) {
  const [values, setValues] = useState<Record<string, Value>>(() =>
    Object.fromEntries(FEATURES.map((f) => [f.key, { enabled: initial[f.key]?.enabled ?? false, limit: initial[f.key]?.limit?.toString() ?? "" }]))
  );
  const [status, setStatus] = useState<string | null>(null);
  const set = (k: string, v: Partial<Value>) => setValues((s) => ({ ...s, [k]: { ...s[k], ...v } }));

  return (
    <div>
      <table className="s1-tbl">
        <thead>
          <tr>
            <th>Функција</th>
            <th>Лимит</th>
          </tr>
        </thead>
        <tbody>
          {FEATURES.map((f) => {
            const value = values[f.key];
            const warn = ZERO_BLOCKS_EVERYTHING.has(f.key) && (!value.enabled || value.limit === "0");
            return (
              <tr key={f.key}>
                <td>
                  <label>
                    <input type="checkbox" aria-label={f.label} checked={value.enabled} onChange={(e) => set(f.key, { enabled: e.target.checked })} /> {f.label}
                  </label>
                </td>
                <td>
                  {f.kind === "limit" ? (
                    <input
                      className="fld"
                      type="number"
                      min={0}
                      aria-label={`Лимит за ${f.label}`}
                      placeholder="без лимит"
                      value={value.limit}
                      onChange={(e) => set(f.key, { limit: e.target.value })}
                      style={{ width: 110 }}
                    />
                  ) : null}
                  {warn ? <span className="muted"> {ZERO_WARNING}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="btn btn-gold"
        onClick={async () => {
          const result = await onSave(
            FEATURES.map((f) => ({
              featureKey: f.key,
              enabled: values[f.key].enabled,
              limitValue: f.kind === "limit" && values[f.key].limit !== "" ? Number(values[f.key].limit) : null,
            }))
          );
          setStatus(result.ok ? "Зачувано." : result.error);
        }}
      >
        Зачувај
      </button>
      {status ? <span className="muted"> {status}</span> : null}
    </div>
  );
}
