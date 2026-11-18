import { formatVenueDatePadded } from "@/lib/date";
import { BlockedExport } from "./BlockedExport";

// Admin spec D8: shown by app/venue/layout.tsx instead of the panel for a
// blocked venue's staff. Renders standalone (no PanelShell), so it carries
// its own "vp" ancestor class — panel.css's .panel/.muted rules are scoped
// under .vp.
//
// 0172: when the admin has also scheduled the venue's deletion, the date is
// shown here too, with the owner's data export (owner password, POST
// /api/venue/privacy/export) — the panel's own banner and Поставки are out
// of reach while blocked.
export function BlockedScreen({
  reason,
  deletionScheduledFor,
  hasOwner = false,
}: {
  reason?: string | null;
  deletionScheduledFor?: string | null;
  /** The venue has an owner manager login; without one the export goes through us. */
  hasOwner?: boolean;
}) {
  return (
    <div className="vp" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="panel" style={{ maxWidth: 520, padding: 32, textAlign: "center" }}>
        <b style={{ fontSize: 18 }}>Пристапот е привремено оневозможен.</b>
        <p className="muted" style={{ marginTop: 8 }}>
          За повеќе информации контактирајте нè преку страницата за контакт.
        </p>
        {reason ? (
          <p className="muted" style={{ marginTop: 8 }}>
            {reason}
          </p>
        ) : null}
        {deletionScheduledFor ? (
          <div role="alert" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)", textAlign: "left" }}>
            <p style={{ margin: "0 0 12px" }}>
              Сметката на локалот ќе биде избришана на <b>{formatVenueDatePadded(deletionScheduledFor)}</b>. Преземете ги вашите податоци
              пред тоа.
            </p>
            {hasOwner ? (
              <BlockedExport />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                За преземање на податоците контактирајте нè преку страницата за контакт.
              </p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
