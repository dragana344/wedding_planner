"use client";

import { useEffect, useState } from "react";
import type { Guest, GuestSeat } from "@/lib/couple/guests";
import { CHANNEL_LABELS, MENU_LABELS, SIDE_LABELS, STATUS_LABELS } from "@/lib/couple/guest-labels";

function formatSent(iso: string): string {
  return new Intl.DateTimeFormat("mk-MK", { timeZone: "Europe/Skopje", day: "numeric", month: "numeric", year: "numeric" }).format(new Date(iso));
}

function seatText(seat: GuestSeat): string {
  return [
    seat.table_label ? `Маса ${seat.table_label}` : null,
    seat.seat_number !== null ? `столче ${seat.seat_number}` : null,
    seat.room_name,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A7: everything about one guest, opened from the list. */
export function GuestDetail({ guest, showSide, onClose }: { guest: Guest; showSide: boolean; onClose: () => void }) {
  const [seat, setSeat] = useState<GuestSeat | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetch(`/api/couple/guests/${guest.id}/seat`)
      .then((res) => (res.ok ? res.json() : { seat: null }))
      .then((data) => live && setSeat(data.seat ?? null))
      .catch(() => live && setSeat(null));
    return () => {
      live = false;
    };
  }, [guest.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: [string, string][] = [
    ["Статус", STATUS_LABELS[guest.rsvp_status] ?? guest.rsvp_status],
    ["Лица", guest.children_count > 0 ? `${guest.party_size} (од кои ${guest.children_count} деца)` : String(guest.party_size)],
    ["Мени", guest.menu_choice ? MENU_LABELS[guest.menu_choice] : "—"],
    ["Алергии", guest.allergies ?? "—"],
    ["Коментар", guest.rsvp_comment ?? "—"],
    ["Телефон", guest.phone ?? "—"],
    ["Email", guest.email ?? "—"],
    ...(showSide ? ([["Страна", guest.side ? SIDE_LABELS[guest.side] : "—"]] as [string, string][]) : []),
    [
      "Покана",
      guest.invitation_sent_at
        ? `Испратена ${formatSent(guest.invitation_sent_at)}${guest.invitation_channel ? ` преку ${CHANNEL_LABELS[guest.invitation_channel]}` : ""}`
        : "Не е испратена",
    ],
    ["Белешки", guest.notes ?? "—"],
  ];

  const titleId = `guest-detail-${guest.id}`;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,22,27,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          width: "100%",
          maxWidth: 520,
          maxHeight: "85vh",
          overflowY: "auto",
          borderRadius: "16px 16px 0 0",
          padding: "18px 20px 24px",
          boxShadow: "0 -10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 id={titleId} className="panel-t" style={{ margin: 0 }}>
            {guest.full_name}
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>
            Затвори
          </button>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 14px", margin: "14px 0 0", fontSize: 14 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt style={{ color: "var(--muted)" }}>{label}</dt>
              <dd style={{ margin: 0, color: "var(--ink)", overflowWrap: "anywhere" }}>{value}</dd>
            </div>
          ))}
          <dt style={{ color: "var(--muted)" }}>Маса</dt>
          <dd style={{ margin: 0, color: "var(--ink)" }}>{seat === undefined ? "…" : seat ? seatText(seat) : "Сè уште нема маса"}</dd>
        </dl>
      </div>
    </div>
  );
}
