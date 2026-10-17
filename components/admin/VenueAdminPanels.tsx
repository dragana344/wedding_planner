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
  signOutStaff,
  resetManagerPassword,
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
        {/* A venue has exactly one login account — this isn't a staff
            roster, just the one login's own facts and actions, so it lives
            here rather than in its own section. */}
        {venue.staff.length === 0 ? (
          <p className="s1-empty" style={{ padding: "0 20px 16px" }}>Нема најава за овој локал.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Е-пошта (најава)</th>
                <th>Последна најава</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {venue.staff.map((s) => (
                <tr key={s.userId}>
                  <td>{s.email}</td>
                  <td>{s.lastSignInAt?.slice(0, 10) ?? "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton label="Ресетирај лозинка" action={() => sendStaffPasswordReset({ venueId: venue.id, userId: s.userId })} />
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
          <h2 className="panel-t">Менаџери</h2>
        </div>
        {venue.managers.length === 0 ? (
          <p className="s1-empty">Нема менаџери.</p>
        ) : (
          <table className="s1-tbl">
            <thead>
              <tr>
                <th>Име</th>
                <th>Улога</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {venue.managers.map((m) => (
                <ManagerRow key={m.id} venueId={venue.id} manager={m} />
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

function ManagerRow({ venueId, manager }: { venueId: string; manager: { id: string; name: string; isOwner: boolean } }) {
  // The admin types in whatever password the caller dictates over the
  // phone — a generated random string isn't practical to read out
  // character by character (app owner's call). Plain text, not a password
  // field: the admin is the one typing it, not authenticating with it.
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(`Стара лозинка на „${manager.name}“ престанува да важи и активните негови/нејзини најави на менаџер се прекинуваат. Продолжи?`)) return;
    setPending(true);
    setStatus(null);
    try {
      const result = await resetManagerPassword({ venueId, managerId: manager.id, newPassword });
      if (result.ok) {
        setIsError(false);
        setStatus("Лозинката е сменета.");
        setNewPassword("");
      } else {
        setIsError(true);
        setStatus(result.error);
      }
    } catch {
      // A failed request (network, server error) must not leave the row disabled.
      setIsError(true);
      setStatus("Акцијата не успеа. Обидете се повторно.");
    } finally {
      setPending(false);
    }
  }

  return (
    <tr>
      <td>{manager.name}</td>
      <td>{manager.isOwner ? "Сопственик" : "Менаџер"}</td>
      <td>
        <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            className="fld"
            placeholder="Нова лозинка"
            aria-label={`Нова лозинка за ${manager.name}`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
            disabled={pending}
          />
          <button type="submit" className="btn btn-ghost" disabled={pending}>
            Зачувај
          </button>
          {status ? <span className="muted" style={{ color: isError ? "var(--bad)" : undefined }}> {status}</span> : null}
        </form>
      </td>
    </tr>
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
      <p className="muted">Ова трајно ги брише локалот, неговите простории, настани и сметките на вработените што не работат во друг локал.</p>
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
          Име на локалот
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
    setStatus(result.ok ? "Локалот е блокиран." : result.error);
  }
  async function unblock() {
    const result = await unblockVenue({ venueId: venue.id });
    setStatus(result.ok ? "Локалот е одблокиран." : result.error);
  }

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <p>Статус: {venue.blockedAt ? `Блокиран${venue.blockedReason ? ` — ${venue.blockedReason}` : ""}` : "Активен"}</p>
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
