import type { GuestStats } from "@/lib/couple/guests";
import "@/components/couple/StatSummaryCard.css";
import "./GuestsSummary.css";
import { MenuNumbersSend } from "@/components/couple/guests/MenuNumbersSend";

// A17: who has answered what, as one 100% bar + legend, instead of a
// separate tile per status (final review finding: the old seven-tile grid
// repeated the same counts the breakdown below already showed). Order keeps
// green and red apart (never adjacent) and the legend carries counts, so the
// split never depends on color alone (palette checked for CVD separation).
const SEGMENTS: { key: "confirmed" | "later" | "declined" | "none"; label: string; color: string }[] = [
  { key: "confirmed", label: "Потврдено", color: "#c9a24a" },
  { key: "later", label: "Подоцна", color: "#6fa89a" },
  { key: "declined", label: "Одбиено", color: "#a4442f" },
  { key: "none", label: "Без одговор", color: "#d8cbb0" },
];

export function GuestsSummary({ stats, canSendNumbers = false }: { stats: GuestStats; canSendNumbers?: boolean }) {
  const counts = {
    confirmed: stats.confirmed,
    later: stats.later,
    declined: stats.declined,
    none: stats.pending + stats.invited,
  };
  const summary = SEGMENTS.map((s) => `${s.label} ${counts[s.key]}`).join(", ");

  return (
    <div className="panel couple-card stat-summary">
      <p className="stat-summary-eyebrow">Гости</p>

      <div className="stat-summary-headline">
        <div className="stat-summary-stat stat-summary-stat-main">
          <span className="stat-summary-num">{stats.total}</span>
          <span className="stat-summary-sub">покани на листата</span>
        </div>
        <div className="stat-summary-headline-secondary">
          <div className="stat-summary-stat">
            <span className="stat-summary-num">{stats.totalAttending}</span>
            <span className="stat-summary-sub">лица доаѓаат</span>
          </div>
          <div className="stat-summary-stat">
            <span className="stat-summary-num">
              {stats.invitationsSent} / {stats.total}
            </span>
            <span className="stat-summary-sub">испратени покани</span>
          </div>
        </div>
      </div>

      <div role="img" aria-label={`Одговори: ${summary}`} className="stat-summary-bar">
        {SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => (
          <div key={s.key} title={`${s.label}: ${counts[s.key]}`} style={{ flexGrow: counts[s.key], flexBasis: 0, background: s.color }} />
        ))}
      </div>

      <ul className="stat-summary-legend">
        {SEGMENTS.map((s) => (
          <li key={s.key}>
            <span aria-hidden className="stat-summary-dot" style={{ background: s.color }} />
            {s.label} {counts[s.key]}
          </li>
        ))}
      </ul>

      {stats.total > 0 ? (
        <>
          {stats.menus.length > 0 ? (
            <p className="guests-summary-menu">
              {`Мени (порции за потврдени): ${stats.menus.map((m) => `${m.name} ${m.count}`).join(" · ")}`}
              {stats.childrenAttending > 0 ? ` · Деца: ${stats.childrenAttending}` : ""}
            </p>
          ) : stats.childrenAttending > 0 ? (
            <p className="guests-summary-menu">{`Деца: ${stats.childrenAttending}`}</p>
          ) : null}
          {stats.notDone.length > 0 ? (
            <p className="guests-summary-menu" title={stats.notDone.map((g) => g.full_name).join(", ")}>
              {stats.notDone.length === 1 ? "Уште 1 гостин нема конечен одговор" : `Уште ${stats.notDone.length} гости немаат конечен одговор`}
            </p>
          ) : null}
        </>
      ) : null}
      {canSendNumbers && stats.menus.length > 0 ? <MenuNumbersSend refreshKey={stats} /> : null}
    </div>
  );
}
