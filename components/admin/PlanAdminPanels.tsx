"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanRow } from "@/lib/admin/queries";
import { FEATURES } from "@/lib/entitlements/features";
import { PlanFeaturesEditor } from "@/components/admin/PlanFeaturesEditor";
import { ConfirmTyped } from "@/components/admin/ConfirmTyped";
import { ActionButton } from "@/components/admin/ActionButton";
import { updatePlan, setPlanFeatures, makeDefaultPlan, deletePlan } from "@/app/admin/(panel)/plans/actions";

// Full plan detail panels (task 3.4): name/description/order/visibility,
// default flag, the full feature/limit editor, and deletion. Same
// composition pattern as VenueAdminPanels (task 3.3).
export function PlanAdminPanels({ plan }: { plan: PlanRow }) {
  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Основни</h2>
        </div>
        <PlanDetailsForm plan={plan} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Стандардно ниво</h2>
        </div>
        <DefaultPanel plan={plan} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Функции и лимити</h2>
        </div>
        <div style={{ padding: "0 20px 16px" }}>
          <PlanFeaturesEditor initial={plan.features} onSave={(features) => setPlanFeatures({ planId: plan.id, features })} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Бришење</h2>
        </div>
        <DeletePlanPanel planId={plan.id} planName={plan.name} />
      </section>
    </>
  );
}

function PlanDetailsForm({ plan }: { plan: PlanRow }) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [sortOrder, setSortOrder] = useState(plan.sortOrder);
  const [isPublic, setIsPublic] = useState(plan.isPublic);
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = await updatePlan({ planId: plan.id, name, description: description.trim() || null, sortOrder, isPublic });
    setStatus(result.ok ? "Зачувано." : result.error);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", padding: "0 20px 16px" }}>
      <div>
        <label className="lab-s" htmlFor="plan-name">
          Име
        </label>
        <input id="plan-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="lab-s" htmlFor="plan-description">
          Опис
        </label>
        <input id="plan-description" className="fld" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="lab-s" htmlFor="plan-sort">
          Редослед
        </label>
        <input id="plan-sort" className="fld" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} style={{ width: 90 }} />
      </div>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {/* Couples on /couple/packages only ever see plans with is_public = true
            (migration 0052) — the default plan and any custom/negotiated plan
            stay hidden unless an admin explicitly opts one in here. */}
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Прикажи на страницата Пакети
      </label>
      <button type="submit" className="btn btn-gold">
        Зачувај
      </button>
      {status ? <span className="muted"> {status}</span> : null}
    </form>
  );
}

function DefaultPanel({ plan }: { plan: PlanRow }) {
  // Every new venue lands on the default plan (0048's venues_default_plan_id).
  // A plan with a switch feature off is not just "a plan with fewer
  // features" the way a limit does — it's a functional gap that silently
  // ships to every future venue the moment this plan becomes the default.
  // Limits aren't included here: a 0/locked limit is a deliberate, visible
  // number on the feature editor, not something this confirmation needs to
  // re-surface.
  const lockedSwitches = FEATURES.filter((f) => f.kind === "switch" && !plan.features[f.key]?.enabled);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function confirmMakeDefault() {
    // Guards against a double submit: ConfirmTyped disables its own input
    // and button while `pending`.
    setPending(true);
    setStatus(null);
    const result = await makeDefaultPlan({ planId: plan.id });
    setPending(false);
    setStatus(result.ok ? "Готово." : result.error);
  }

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <p>
        {plan.isDefault
          ? "Ова е стандардното ниво за нови локали."
          : `Го користат ${plan.venueCount} ${plan.venueCount === 1 ? "локал" : "локали"}.`}
      </p>
      {!plan.isDefault ? (
        lockedSwitches.length > 0 ? (
          <>
            <p className="auth-error">
              {`Внимание: во ова ниво се заклучени ${lockedSwitches.length} ${lockedSwitches.length === 1 ? "функција" : "функции"} (${lockedSwitches
                .map((f) => f.label)
                .join(", ")}). Секој нов локал ќе почне без нив.`}
            </p>
            <ConfirmTyped expected={plan.name} label="Направи стандардно" onConfirm={confirmMakeDefault} pending={pending} />
            {status ? <span className="muted"> {status}</span> : null}
          </>
        ) : (
          <ActionButton
            label="Направи стандардно"
            confirm="Ова ниво станува стандардно за сите нови локали. Продолжи?"
            action={() => makeDefaultPlan({ planId: plan.id })}
          />
        )
      ) : null}
    </div>
  );
}

function DeletePlanPanel({ planId, planName }: { planId: string; planName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    // Guards against a double submit: ConfirmTyped disables its own input
    // and button while `pending`, so a second click can't fire this again
    // before the first request resolves.
    setPending(true);
    setError(null);
    const result = await deletePlan({ planId });
    if (result.ok) {
      router.push("/admin/plans");
      return;
    }
    setPending(false);
    setError(result.error);
  }

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <p className="muted">Не може да се избрише стандардното ниво или ниво што го користат локали — прво преместете ги.</p>
      <ConfirmTyped expected={planName} label="Избриши ниво" onConfirm={confirm} pending={pending} />
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
