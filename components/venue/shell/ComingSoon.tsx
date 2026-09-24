import { Icon } from "./Icon";

/**
 * Placeholder for nav sections that exist in the approved design but have no
 * data layer yet. Keeps the panel's IA complete instead of hiding the gap.
 */
export function ComingSoon({ icon, title, note }: { icon: string; title: string; note: string }) {
  return (
    <div className="wrap">
      <section className="panel">
        <div className="empty" style={{ padding: "72px 24px" }}>
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: 18,
              background: "var(--gold-tint)",
              color: "var(--gold-lo)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 18px",
            }}
          >
            <Icon name={icon} size="lg" />
          </div>
          <b style={{ fontSize: 18 }}>{title}</b>
          <p style={{ maxWidth: 460, margin: "8px auto 0", lineHeight: 1.6 }}>{note}</p>
          <span
            className="pill p-warn"
            style={{ marginTop: 18, display: "inline-flex" }}
          >
            Наскоро
          </span>
        </div>
      </section>
    </div>
  );
}
