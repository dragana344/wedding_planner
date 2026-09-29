import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";

// ARCH-003: Support is a real contact route, not a placeholder. The address
// comes from SUPPORT_EMAIL (falls back to the team inbox for contact-form mail).
export const dynamic = "force-dynamic";

export default function SupportPage() {
  const email = process.env.SUPPORT_EMAIL ?? process.env.CONTACT_NOTIFY_EMAIL ?? null;

  return (
    <div className="wrap">
      <section className="panel">
        <div className="empty" style={{ padding: "56px 24px" }}>
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
            <Icon name="life" size="lg" />
          </div>
          <b style={{ fontSize: 18 }}>Поддршка</b>
          <p style={{ maxWidth: 460, margin: "8px auto 0", lineHeight: 1.6 }}>
            Имате прашање, проблем или предлог? Пишете ни и ќе ви одговориме во рок од еден работен ден. Ако станува збор за
            настан денес, наведете го тоа во насловот.
          </p>
          {email ? (
            <a className="btn btn-gold" href={`mailto:${email}?subject=${encodeURIComponent("Поддршка — КАДЕ СУМ?")}`} style={{ marginTop: 18, display: "inline-flex" }}>
              Пишете ни: {email}
            </a>
          ) : (
            <Link className="btn btn-gold" href="/#contact" style={{ marginTop: 18, display: "inline-flex" }}>
              Контакт форма
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
