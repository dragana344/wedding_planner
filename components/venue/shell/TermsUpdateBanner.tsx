import Link from "next/link";

/** The in-panel page where the owner accepts a newer version of the Terms. */
export const VENUE_TERMS_HREF = "/venue/terms";

/**
 * A newer LEGAL_VERSION than the one the venue accepted. Unlike the first
 * acceptance it never blocks the panel: staff keep working, and the owner
 * accepts from /venue/terms (lib/venue/onboarding.ts termsUpdatePending).
 */
export function TermsUpdateBanner({ pending, onTermsPage }: { pending: boolean | undefined; onTermsPage: boolean }) {
  if (!pending || onTermsPage) return null;
  return (
    <div
      role="status"
      className="panel s1-locked-banner"
      style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "4px solid var(--gold)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
    >
      <span>Ажурирани се условите за користење — сопственикот треба да ги прифати.</span>
      <Link className="btn btn-ghost" href={VENUE_TERMS_HREF}>
        Прочитај и прифати
      </Link>
    </div>
  );
}
