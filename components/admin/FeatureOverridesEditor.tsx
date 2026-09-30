"use client";

import { useState } from "react";
import { FEATURES, type FeatureKey, type FeatureMap } from "@/lib/entitlements/features";
import type { OverrideRow } from "@/lib/admin/queries";
import type { ActionResult } from "@/lib/admin/actions";

type Save = (v: { featureKey: FeatureKey; enabled: boolean | null; limitOverride: boolean; limitValue: number | null; note: string | null }) => Promise<ActionResult<null>>;

// Editor for one scope's feature overrides (spec §4.3): venue scope covers
// every feature (its overrides are the fallback for events that carry none
// of their own), event scope only the event-level ones.
export function FeatureOverridesEditor({
  scope,
  features,
  overrides,
  onSave,
}: {
  scope: "venue" | "event";
  features: FeatureMap;
  overrides: OverrideRow[];
  onSave: Save;
}) {
  const rows = FEATURES.filter((f) => scope === "venue" || f.scope === "event");
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Функција</th>
          <th>Важи сега</th>
          <th>Исклучок</th>
          <th>Лимит</th>
          <th>Белешка</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <OverrideRowEditor key={f.key} def={f} resolved={features[f.key]} current={overrides.find((o) => o.featureKey === f.key)} onSave={onSave} />
        ))}
      </tbody>
    </table>
  );
}

function OverrideRowEditor({
  def,
  resolved,
  current,
  onSave,
}: {
  def: (typeof FEATURES)[number];
  resolved: { enabled: boolean; limit: number | null };
  current?: OverrideRow;
  onSave: Save;
}) {
  const [mode, setMode] = useState(current?.enabled === true ? "on" : current?.enabled === false ? "off" : "inherit");
  const [limitOverride, setLimitOverride] = useState(current?.limitOverride ?? false);
  const [limit, setLimit] = useState(current?.limitValue?.toString() ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    const result = await onSave({
      featureKey: def.key,
      enabled: mode === "inherit" ? null : mode === "on",
      limitOverride,
      limitValue: limitOverride && limit !== "" ? Number(limit) : null,
      note: note.trim() || null,
    });
    setStatus(result.ok ? "Зачувано." : result.error);
  }

  return (
    <tr>
      <td>{def.label}</td>
      <td>
        {resolved.enabled ? "Отклучено" : "Заклучено"}
        {def.kind === "limit" ? ` · ${resolved.limit ?? "без лимит"}` : ""}
      </td>
      <td>
        <select className="fld" aria-label={def.label} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="inherit">Од нивото</option>
          <option value="on">Отклучи</option>
          <option value="off">Заклучи</option>
        </select>
      </td>
      <td>
        {def.kind === "limit" ? (
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" aria-label={`Промени лимит за ${def.label}`} checked={limitOverride} onChange={(e) => setLimitOverride(e.target.checked)} />
            <input
              className="fld"
              type="number"
              min={0}
              aria-label={`Лимит за ${def.label}`}
              placeholder="без лимит"
              disabled={!limitOverride}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{ width: 110 }}
            />
          </span>
        ) : (
          "—"
        )}
      </td>
      <td>
        <input className="fld" aria-label={`Белешка за ${def.label}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </td>
      <td>
        <button type="button" className="btn btn-ghost" onClick={save} aria-label={`Зачувај ${def.label}`}>
          Зачувај
        </button>
        {status ? <span className="muted"> {status}</span> : null}
      </td>
    </tr>
  );
}
