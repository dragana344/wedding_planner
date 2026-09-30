"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VenueDetail, OverrideRow } from "@/lib/admin/queries";
import type { FeatureMap } from "@/lib/entitlements/features";
import { FeatureOverridesEditor } from "@/components/admin/FeatureOverridesEditor";
import { ConfirmTyped } from "@/components/admin/ConfirmTyped";
import { ActionButton } from "@/components/admin/ActionButton";
import {
  renameVenue,
  setVenuePlan,
  saveVenueOverride,
  sendStaffPasswordReset,
  removeStaffMfa,
  signOutStaff,
  blockVenue,
  unblockVenue,
  deleteVenue,
} from "@/app/admin/(panel)/venues/actions";

// Full venue detail panels (task 3.3): rename, plan, feature overrides,
// staff support actions, block/unblock, and account deletion. Task 3.2 left
// this as a name-only stub; the venue detail page (app/admin/(panel)/
// venues/[id]/page.tsx) already passes every prop this needs.
export function VenueAdminPanels({
  venue,
  plans,
  overrides,
  features,
}: {
  venue: VenueDetail;
  plans: { id: string; name: string }[];
  overrides: OverrideRow[];
  features: FeatureMap;
}) {
  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Основни</h2>
        </div>
        <RenameForm venueId={venue.id} initialName={venue.name} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Ниво</h2>
        </div>
        <PlanSelect venueId={venue.id} planId={venue.planId} plans={plans} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Функции</h2>
        </div>
        <FeatureOverridesEditor scope="venue" features={features} overrides={overrides} onSave={(v) => saveVenueOverride({ venueId: venue.id, ...v })} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Вработени</h2>
        </div>
        {venue.staff.length === 0 ? (
          <p className="s1-empty">Нема вработени.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Е-пошта</th>
                <th>2FA</th>
                <th>Последна најава</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {venue.staff.map((s) => (
                <tr key={s.userId}>
                  <td>{s.email}</td>
                  <td>{s.mfa ? "Да" : "Не"}</td>
                  <td>{s.lastSignInAt?.slice(0, 10) ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton label="Ресетирај лозинка" action={() => sendStaffPasswordReset({ venueId: venue.id, userId: s.userId })} />
                      <ActionButton
                        label="Отстрани 2FA"
                        confirm="Отстрани ја двофакторската автентикација?"
                        action={() => removeStaffMfa({ venueId: venue.id, userId: s.userId })}
                      />
                      {/* admin_sign_out_user only ends refresh tokens (0047); an
                          access token already issued to the browser keeps working
                          until it expires (≤1h), so the label must not promise an
                          instant sign-out. */}
                      <ActionButton
                        label="Одјави од сите уреди (во рок од 1 час)"
                        action={() => signOutStaff({ venueId: venue.id, userId: s.userId })}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Статус</h2>
        </div>
        <StatusPanel venue={venue} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Бришење</h2>
        </div>
        <DeleteVenuePanel venueId={venue.id} venueName={venue.name} />
      </section>
    </>
  );
}

function DeleteVenuePanel({ venueId, venueName }: { venueId: string; venueName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(typed: string) {
    // Guards against a double submit: ConfirmTyped disables its own input
    // and button while `pending`, so a second click can't fire this again
    // before the first request resolves.
    setPending(true);
    setError(null);
    const result = await deleteVenue({ venueId, confirmName: typed });
    if (result.ok) {
      router.push("/admin/venues");
      return;
    }
    setPending(false);
    setError(result.error);
  }

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <p className="muted">Ова трајно ги брише салата, нејзините простории, настани и сметките на вработените што не работат во друга сала.</p>
      <ConfirmTyped expected={venueName} label="Избриши сметка" onConfirm={confirm} pending={pending} />
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}

function RenameForm({ venueId, initialName }: { venueId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = await renameVenue({ venueId, name });
    setStatus(result.ok ? "Зачувано." : result.error);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "end", padding: "0 20px 16px" }}>
      <div>
        <label className="lab-s" htmlFor="venue-name">
          Име на салата
        </label>
        <input id="venue-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-gold">
        Зачувај
      </button>
      {status ? <span className="muted"> {status}</span> : null}
    </form>
  );
}

function PlanSelect({ venueId, planId, plans }: { venueId: string; planId: string; plans: { id: string; name: string }[] }) {
  const [selected, setSelected] = useState(planId);
  const [status, setStatus] = useState<string | null>(null);

  async function change(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setSelected(next);
    const result = await setVenuePlan({ venueId, planId: next });
    setStatus(result.ok ? "Зачувано." : result.error);
  }

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <label className="lab-s" htmlFor="venue-plan">
        Ниво
      </label>
      <select id="venue-plan" className="fld" value={selected} onChange={change}>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {status ? <span className="muted"> {status}</span> : null}
    </div>
  );
}

function StatusPanel({ venue }: { venue: VenueDetail }) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function block() {
    const result = await blockVenue({ venueId: venue.id, reason });
    setStatus(result.ok ? "Салата е блокирана." : result.error);
  }
  async function unblock() {
    const result = await unblockVenue({ venueId: venue.id });
    setStatus(result.ok ? "Салата е одблокирана." : result.error);
  }

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <p>Статус: {venue.blockedAt ? `Блокирана${venue.blockedReason ? ` — ${venue.blockedReason}` : ""}` : "Активна"}</p>
      {venue.blockedAt ? (
        <button type="button" className="btn btn-ghost" onClick={unblock}>
          Одблокирај
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div>
            <label className="lab-s" htmlFor="block-reason">
              Причина за блокирање
            </label>
            <input id="block-reason" className="fld" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button type="button" className="btn btn-ghost" style={{ color: "var(--bad)" }} disabled={!reason.trim()} onClick={block}>
            Блокирај
          </button>
        </div>
      )}
      {status ? <span className="muted"> {status}</span> : null}
    </div>
  );
}
