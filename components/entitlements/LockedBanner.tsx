import Link from "next/link";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";

/**
 * Shown above a locked section's content (couple pages and the venue panel,
 * admin dashboard spec §4.4). Existing data stays visible, readable and
 * downloadable — the API refuses only adding and changing (POST/PUT/PATCH,
 * lib/api/handler.ts), so the banner says exactly that.
 */
export function LockedBanner({ audience, flush = false }: { audience: "couple" | "venue"; flush?: boolean }) {
  return (
    <div role="status" className="panel s1-locked-banner" style={{ margin: flush ? 0 : "0 0 16px", padding: "12px 16px", borderLeft: "4px solid var(--gold-lo)" }}>
      <b>{LOCKED_MESSAGE}</b>{" "}
      Постоечките податоци можете да ги гледате и преземате, но не можете да додавате нови ниту да ги менувате.{" "}
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
 * A locked section's page (group A task 2: a downgrade never hides data).
 * The content stays fully readable — not blurred, reachable by keyboard and
 * screen readers — under a LockedBanner; writes are refused by the API's
 * feature gate. A page whose data must not reach a locked account at all
 * checks the feature on the server and renders nothing (e.g. venue reports).
 */
export function LockedContent({ audience, children }: { audience: "couple" | "venue"; children: React.ReactNode }) {
  return (
    <>
      <div className="locked-notice">
        <LockedBanner audience={audience} flush />
      </div>
      {children}
    </>
  );
}
