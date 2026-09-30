"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlan } from "@/app/admin/(panel)/plans/actions";

// New plans start with every switch off and every limit enabled/unlimited
// (storage_gb=5, photo_retention_days=15) — see lib/admin/plan-actions-core.ts's
// defaultFeatureRow. This form only captures the plan's own fields; features
// are tuned afterwards on the plan's own detail page (PlanFeaturesEditor),
// same two-step flow as creating a venue account then setting its features.
export function CreatePlanForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isPublic, setIsPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await createPlan({ name, description: description.trim() || null, sortOrder, isPublic });
    if (result.ok) {
      router.push(`/admin/plans/${result.data.id}`);
      return;
    }
    setPending(false);
    setError(result.error);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
      <div>
        <label className="lab-s" htmlFor="new-plan-name">
          Име
        </label>
        <input id="new-plan-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required disabled={pending} />
      </div>
      <div>
        <label className="lab-s" htmlFor="new-plan-description">
          Опис
        </label>
        <input id="new-plan-description" className="fld" value={description} onChange={(e) => setDescription(e.target.value)} disabled={pending} />
      </div>
      <div>
        <label className="lab-s" htmlFor="new-plan-sort">
          Редослед
        </label>
        <input
          id="new-plan-sort"
          className="fld"
          type="number"
          min={0}
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          style={{ width: 90 }}
          disabled={pending}
        />
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} disabled={pending} /> Прикажи на страницата Пакети
      </label>
      <button type="submit" className="btn btn-gold" disabled={pending || !name.trim()}>
        Додади ниво
      </button>
      {error ? <span className="muted"> {error}</span> : null}
    </form>
  );
}
