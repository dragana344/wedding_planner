import Link from "next/link";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";

/**
 * Shown above a locked section's content (couple pages and the venue panel,
 * admin dashboard spec §4.4). Existing data stays visible/readable — only
 * new data entry is refused, so the banner explains that rather than hiding
 * the page.
 */
export function LockedBanner({ audience }: { audience: "couple" | "venue" }) {
  return (
    <div role="status" className="panel s1-locked-banner" style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "4px solid var(--gold-lo)" }}>
      <b>{LOCKED_MESSAGE}</b>{" "}
      Постоечките податоци можете да ги гледате, но нови не можете да додавате.{" "}
      {audience === "couple" ? (
        <>
          За надградба контактирајте го вашиот локал. <Link href="/couple/packages">Види пакети</Link>
        </>
      ) : (
        "За надградба контактирајте нè."
      )}
    </div>
  );
}

/**
 * A locked section's page: the content sits blurred and unreachable (no
 * pointer, no keyboard, hidden from screen readers) behind a card that says
 * the section is not in the package. The blur is cosmetic only — a page whose
 * data must not reach a locked account checks the feature on the server.
 */
export function LockedContent({ audience, children }: { audience: "couple" | "venue"; children: React.ReactNode }) {
  return (
    <div className="locked-wrap">
      <div className="locked-blur" inert aria-hidden="true">
        {children}
      </div>
      <div role="status" className="panel locked-card">
        <span className="locked-icon" aria-hidden="true">🔒</span>
        <b>{LOCKED_MESSAGE}</b>
        {audience === "couple" ? (
          <p>
            За надградба контактирајте го вашиот локал. <Link href="/couple/packages">Види пакети</Link>
          </p>
        ) : (
          <p>За надградба контактирајте нè.</p>
        )}
      </div>
    </div>
  );
}
