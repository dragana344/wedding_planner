"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateVenueBrandColor } from "@/lib/venue/venue-profile";
import { brandVars, normalizeBrandColor } from "@/lib/venue/brand-palette";
import { errorMessage } from "@/lib/venue/user-error";

const PLATFORM_GOLD = "#c9992f";

/**
 * Settings → the venue's own accent colour (branding, 0087). With the
 * venue's logo it replaces the platform's mark and gold in the venue's panel,
 * its couples' panels and on the guests' pages. Locked plans see what it is
 * and that it is not included, instead of a control that silently does nothing.
 */
export function BrandColorForm({ venueId, color: initialColor, enabled }: { venueId: string; color: string | null; enabled: boolean }) {
  const router = useRouter();
  const [color, setColor] = useState(initialColor ?? PLATFORM_GOLD);
  const [saved, setSaved] = useState(initialColor);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = brandVars(color);

  async function apply(next: string | null) {
    setStatus(null);
    setFailed(false);
    setBusy(true);
    try {
      await updateVenueBrandColor(venueId, next);
      setSaved(next ? normalizeBrandColor(next) : null);
      if (!next) setColor(PLATFORM_GOLD);
      setStatus(next ? "Бојата е зачувана." : "Вратена е стандардната боја.");
      // The panel around this form takes its colours from the server layout.
      router.refresh();
    } catch (err) {
      setFailed(true);
      setStatus(errorMessage(err, "Не успеа зачувувањето на бојата. Обидете се повторно."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="ev-form"
      onSubmit={(e) => {
        e.preventDefault();
        void apply(color);
      }}
    >
      <p className="ev-hint" style={{ margin: 0 }}>
        Вашето лого и вашата боја наместо ознаките на платформата: во вашиот панел, во панелот на младенците и на поканата и албумот што ги
        гледаат гостите.
      </p>
      {enabled ? null : (
        <p role="status" style={{ margin: 0, fontSize: 13.5, color: "var(--warn)" }}>
          Брендирањето не е вклучено во вашиот пакет. За надградба контактирајте нè.
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <label className="lab-s" htmlFor="venue-brand-color" style={{ margin: 0 }}>
          Боја на локалот
        </label>
        <input
          id="venue-brand-color"
          type="color"
          value={normalizeBrandColor(color) ?? PLATFORM_GOLD}
          onChange={(e) => setColor(e.target.value)}
          disabled={!enabled || busy}
          style={{ width: 52, height: 36, padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}
        />
        <code style={{ fontFamily: "var(--data)", fontSize: 13 }}>{normalizeBrandColor(color) ?? "—"}</code>
        {preview ? (
          <span
            aria-hidden="true"
            style={{ background: preview["--gold"], color: preview["--on-gold"], borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13.5 }}
          >
            Пример копче
          </span>
        ) : null}
      </div>
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn btn-gold" type="submit" disabled={!enabled || busy}>
          {busy ? "Се зачувува..." : "Зачувај боја"}
        </button>
        {saved ? (
          <button className="btn btn-ghost" type="button" onClick={() => void apply(null)} disabled={busy}>
            Врати ја стандардната
          </button>
        ) : null}
      </div>
      {status ? (
        <p role="status" className={failed ? undefined : "ev-hint"} style={failed ? { color: "var(--bad)", fontSize: 13.5, margin: 0 } : { margin: 0 }}>
          {status}
        </p>
      ) : null}
    </form>
  );
}
