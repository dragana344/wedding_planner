import Link from "next/link";
import { formatBytes, storageBreakdown, type StorageUsage } from "@/lib/media/limits";

/** The album's space, shown like a phone plan's data meter (C5). */
export function StorageMeter({ usage }: { usage: StorageUsage }) {
  const b = storageBreakdown(usage);
  const segments = [
    { label: "Фотографии", pct: b.photoPct, className: "s4-seg-photo" },
    { label: "Видеа", pct: b.videoPct, className: "s4-seg-video" },
    { label: "Останато", pct: b.freePct, className: "s4-seg-free" },
  ];

  return (
    <section className="s4-meter" aria-labelledby="s4-meter-title">
      <div className="s4-meter-head">
        <h2 id="s4-meter-title" className="s4-meter-title">Ваш простор: {formatBytes(usage.limitBytes)}</h2>
        <span className="s4-meter-used">
          Искористено: {formatBytes(b.usedBytes)} / {formatBytes(usage.limitBytes)}
        </span>
      </div>
      <div className="s4-meter-bar">
        {segments.map((s) =>
          s.pct > 0 ? <span key={s.label} className={s.className} style={{ width: `${s.pct}%` }} aria-label={`${s.label} ${s.pct} %`} role="img" /> : null,
        )}
      </div>
      <ul className="s4-meter-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className={`s4-dot ${s.className}`} aria-hidden />
            {s.label} {s.pct} %
          </li>
        ))}
      </ul>
      {b.full && (
        <p className="s4-meter-full" role="alert">
          Просторот е полн — гостите не можат да прикачуваат нови фотографии.
        </p>
      )}
      <Link className="s4-meter-cta" href="/couple/packages">
        Активирајте дополнителен пакет за повеќе простор
      </Link>
    </section>
  );
}
