import type { GuestStats } from "@/lib/couple/guests";

// A17: who has answered what, as one 100% bar. Order keeps green and red
// apart (never adjacent) and the legend carries counts and percentages, so
// the split never depends on color alone (palette checked for CVD separation).
const SEGMENTS: { key: "confirmed" | "later" | "none" | "declined"; label: string; color: string }[] = [
  { key: "confirmed", label: "Потврдени", color: "var(--ok)" },
  { key: "later", label: "Подоцна", color: "var(--info)" },
  { key: "none", label: "Без одговор", color: "var(--off)" },
  { key: "declined", label: "Одбиени", color: "var(--bad)" },
];

export function RsvpBreakdown({ stats }: { stats: GuestStats }) {
  const counts = {
    confirmed: stats.confirmed,
    later: stats.later,
    none: stats.pending + stats.invited,
    declined: stats.declined,
  };
  const pct = (n: number) => (stats.total === 0 ? 0 : Math.round((n / stats.total) * 100));
  const summary = SEGMENTS.map((s) => `${s.label} ${pct(counts[s.key])}%`).join(", ");

  return (
    <div className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 className="panel-t" style={{ margin: 0 }}>
        Одговори
      </h2>
      <div role="img" aria-label={`Одговори: ${summary}`} style={{ display: "flex", gap: 2, height: 14, borderRadius: 4, overflow: "hidden", background: "var(--line-soft)" }}>
        {SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${counts[s.key]} (${pct(counts[s.key])}%)`}
            style={{ flexGrow: counts[s.key], flexBasis: 0, background: s.color }}
          />
        ))}
      </div>
      <ul style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", listStyle: "none", margin: 0, padding: 0, fontSize: 13, color: "var(--ink-2)" }}>
        {SEGMENTS.map((s) => (
          <li key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            {`${s.label} · ${counts[s.key]} (${pct(counts[s.key])}%)`}
          </li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
        Мени (порции за потврдени): Стандардно {stats.menu.standard} · Посно {stats.menu.posno} · Вегетаријанско {stats.menu.vegetarian} · Неизбрано{" "}
        {stats.menu.unset}
        {stats.childrenAttending > 0 ? ` · Деца: ${stats.childrenAttending}` : ""}
      </p>
    </div>
  );
}
