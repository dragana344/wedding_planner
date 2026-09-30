// Admin spec D8: shown by app/venue/layout.tsx instead of the panel for a
// blocked venue's staff. Renders standalone (no PanelShell), so it carries
// its own "vp" ancestor class — panel.css's .panel/.muted rules are scoped
// under .vp.
export function BlockedScreen({ reason }: { reason?: string | null }) {
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
      </section>
    </div>
  );
}
