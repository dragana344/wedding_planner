"use client";

import { useEffect, useState } from "react";
import type { Guest, GuestSeat, GuestSide } from "@/lib/couple/guests";
import { CHANNEL_LABELS, SIDE_LABELS, STATUS_LABELS } from "@/lib/couple/guest-labels";
import { GuestSendButtons, type SendActions, type ShareContext } from "@/components/couple/guests/InviteSend";
import { formatVenueDateTime } from "@/lib/date";
import { isGuestDone } from "@/lib/couple/guest-menus";
import { jsonOrThrow } from "@/lib/couple/client-utils";

/** Mirrors lib/media/greetings `Greeting` (a server-only module). */
interface GuestGreeting {
  id: string;
  message: string;
  videoUrl: string | null;
}

function formatSent(iso: string): string {
  return formatVenueDateTime(iso);
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

function menuText(guest: Guest, menus: { id: string; name: string }[]): string {
  if (guest.rsvp_status !== "confirmed") return "—";
  if (!isGuestDone(guest, menus.map((m) => m.id))) return "Нема избрано мени";
  return menus
    .filter((m) => (guest.menu_counts[m.id] ?? 0) > 0)
    .map((m) => `${m.name} ${guest.menu_counts[m.id]}`)
    .join(" · ");
}

/** Edits how a confirmed guest's party splits across the event's menus. */
function MenuCountsEditor({
  guest,
  menus,
  onSaved,
}: {
  guest: Guest;
  menus: { id: string; name: string }[];
  onSaved?: (guest: Guest) => void;
}) {
  const initial = () => Object.fromEntries(menus.map((m) => [m.id, String(guest.menu_counts[m.id] ?? 0)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const total = menus.reduce((sum, m) => sum + (Number(values[m.id]) || 0), 0);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const counts: Record<string, number> = {};
      for (const m of menus) {
        const n = Number(values[m.id]) || 0;
        if (n > 0) counts[m.id] = n;
      }
      const saved = (await jsonOrThrow(
        await fetch(`/api/couple/guests/${guest.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "menus", counts }),
        }),
      )) as Guest;
      onSaved?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на менито.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Мени по лице</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {menus.map((m) => (
          <label key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
            <span>{m.name}</span>
            <input
              type="number"
              min={0}
              max={guest.party_size}
              inputMode="numeric"
              aria-label={m.name}
              className="fld"
              style={{ width: 90 }}
              value={values[m.id] ?? "0"}
              onChange={(e) => setValues((prev) => ({ ...prev, [m.id]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <p style={{ margin: "8px 0", fontSize: 13.5, color: total === guest.party_size ? "var(--muted)" : "var(--bad)" }}>
        {`Избрано ${total} од ${guest.party_size} лица`}
      </p>
      {error ? (
        <p role="alert" style={{ margin: "0 0 8px", fontSize: 13.5, color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
      <button type="button" className="btn" disabled={saving} onClick={save}>
        {saving ? "Се зачувува..." : "Зачувај мени"}
      </button>
    </div>
  );
}

/** A7: everything about one guest, opened from the list. */
export function GuestDetail({
  guest,
  showSide,
  share,
  actions,
  sendBlockedBy = null,
  sendingEnabled = true,
  greetingsEnabled = false,
  menus = [],
  canEditMenus = true,
  onMenusSaved,
  onClose,
}: {
  guest: Guest;
  showSide: boolean;
  share: ShareContext | undefined;
  actions: SendActions;
  /** A co-organizer viewing the other side's guest (A12): that side sends. */
  sendBlockedBy?: GuestSide | null;
  /** The package includes `personal_invite_links`. */
  sendingEnabled?: boolean;
  /** The package includes `guest_greetings` (Session 4's greetings). */
  greetingsEnabled?: boolean;
  /** The event's menus (id, name); counts are edited here only when there are 2 or more. */
  menus?: { id: string; name: string }[];
  /** A co-organizer edits only their own side's guests. */
  canEditMenus?: boolean;
  onMenusSaved?: (guest: Guest) => void;
  onClose: () => void;
}) {
  const [seat, setSeat] = useState<GuestSeat | null | undefined>(undefined);
  const [greetings, setGreetings] = useState<GuestGreeting[] | undefined>(undefined);

  useEffect(() => {
    if (!greetingsEnabled) return;
    let live = true;
    fetch(`/api/couple/guests/${guest.id}/greetings`)
      .then((res) => (res.ok ? res.json() : { greetings: [] }))
      .then((data) => live && setGreetings(data.greetings ?? []))
      .catch(() => live && setGreetings([]));
    return () => {
      live = false;
    };
  }, [guest.id, greetingsEnabled]);

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
    ...(menus.length > 1 ? ([["Мени", menuText(guest, menus)]] as [string, string][]) : []),
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
        {menus.length > 1 && canEditMenus && guest.rsvp_status === "confirmed" ? (
          <MenuCountsEditor key={`${guest.id}-${guest.party_size}-${JSON.stringify(guest.menu_counts)}`} guest={guest} menus={menus} onSaved={onMenusSaved} />
        ) : null}
        {greetingsEnabled ? (
          <>
            <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Честитка</h3>
            {greetings === undefined ? (
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>…</p>
            ) : greetings.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>Сè уште нема честитка</p>
            ) : (
              greetings.map((g) => (
                <div key={g.id} style={{ fontSize: 14, margin: "0 0 8px" }}>
                  <p style={{ margin: 0, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{g.message}</p>
                  {g.videoUrl ? (
                    <a href={g.videoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5 }}>
                      Видео честитка
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </>
        ) : null}
        <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>{guest.invitation_sent_at ? "Прати повторно" : "Прати покана"}</h3>
        {!sendingEnabled ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>Праќањето персонални покани не е вклучено во вашиот пакет.</p>
        ) : sendBlockedBy ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
            {`Поканата ја праќа страната на ${sendBlockedBy === "bride" ? "невестата" : "младоженецот"}.`}
          </p>
        ) : (
          <GuestSendButtons guest={guest} share={share} actions={actions} />
        )}
      </div>
    </div>
  );
}
