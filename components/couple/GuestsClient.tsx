"use client";

import { useCallback, useMemo, useState } from "react";
import type { Guest, GuestSide, GuestStats, InvitationChannel, MenuChoice, RsvpStatus } from "@/lib/couple/guests";
import { MENU_LABELS, STATUS_LABELS } from "@/lib/couple/guest-labels";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { Icon } from "@/components/venue/shell/Icon";
import { GuestDetail } from "@/components/couple/guests/GuestDetail";
import { RsvpBreakdown } from "@/components/couple/guests/RsvpBreakdown";
import { BulkSendDialog, type SendActions, type ShareContext } from "@/components/couple/guests/InviteSend";

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as RsvpStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] }));
const MENU_OPTIONS = (Object.keys(MENU_LABELS) as MenuChoice[]).map((value) => ({ value, label: MENU_LABELS[value] }));

/** SEC-021: when the public invitation link last changed a guest's answer, in venue time. */
function formatLinkChange(iso: string): string {
  return new Intl.DateTimeFormat("mk-MK", {
    timeZone: "Europe/Skopje",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const SIDE_OPTIONS: { value: GuestSide; label: string }[] = [
  { value: "bride", label: "Страна на невестата" },
  { value: "groom", label: "Страна на младоженецот" },
];

type SentFilter = "" | "sent" | "unsent";

// .fld is full-width by default; filters share one row and wrap on phones.
const FILTER_STYLE: React.CSSProperties = { width: "auto", flex: "1 1 150px" };
const COLUMN_STYLE: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 };

/** A file's text, via FileReader where `Blob.text()` is missing (older browsers). */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function GuestsClient({
  initialGuests,
  initialStats,
  eventType,
  share,
  organizerSide = null,
  sendingEnabled = true,
  greetingsEnabled = false,
}: {
  initialGuests: Guest[];
  initialStats: GuestStats;
  eventType: string;
  /** For sending invitations (A9); missing or slug-less means no invitation yet. */
  share?: ShareContext;
  /** Set when a co-organizer is signed in (A12): they send only to this side. */
  organizerSide?: GuestSide | null;
  /** The package includes `personal_invite_links` (A9). */
  sendingEnabled?: boolean;
  /** The package includes `guest_greetings`: show each guest's greeting in the details. */
  greetingsEnabled?: boolean;
}) {
  const isWedding = eventType === "wedding";

  const [guests, setGuests] = useState(initialGuests);
  const [stats, setStats] = useState(initialStats);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [notes, setNotes] = useState("");
  const [side, setSide] = useState<GuestSide>("bride");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RsvpStatus | "">("");
  const [menuFilter, setMenuFilter] = useState<MenuChoice | "none" | "">("");
  const [sentFilter, setSentFilter] = useState<SentFilter>("");
  const [openGuestId, setOpenGuestId] = useState<string | null>(null);
  const closeDetail = useCallback(() => setOpenGuestId(null), []);
  const [bulkOpen, setBulkOpen] = useState(false);
  const closeBulk = useCallback(() => setBulkOpen(false), []);

  async function reload() {
    const data = await jsonOrThrow(await fetch("/api/couple/guests"));
    setGuests(data.guests);
    setStats(data.stats);
  }

  async function refreshStats() {
    const data = await jsonOrThrow(await fetch("/api/couple/guests"));
    setStats(data.stats);
  }

  const sendActions: SendActions = {
    async markSent(guestIds: string[], channel: InvitationChannel) {
      setError(null);
      try {
        const { guests: updated } = await jsonOrThrow(
          await fetch("/api/couple/guests/sent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guest_ids: guestIds, channel }),
          }),
        );
        const byId = new Map((updated as Guest[]).map((g) => [g.id, g]));
        setGuests((prev) => prev.map((g) => byId.get(g.id) ?? g));
        await refreshStats();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не успеа означувањето на поканите.");
      }
    },
    async emailInvites(guestIds: string[]) {
      setError(null);
      setNotice(null);
      try {
        const result = await jsonOrThrow(
          await fetch("/api/couple/guests/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guest_ids: guestIds }),
          }),
        );
        await reload();
        setNotice(`Испратени email покани: ${result.sent}. Без email адреса: ${result.skipped}. Неуспешни: ${result.failed}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не успеа праќањето на поканите.");
      }
    },
  };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await jsonOrThrow(
        await fetch("/api/couple/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName,
            phone: phone || null,
            email: email || null,
            party_size: Number(partySize),
            notes: notes || null,
            side: isWedding ? side : null,
          }),
        }),
      );
      setGuests((prev) => [...prev, created]);
      setFullName("");
      setPhone("");
      setEmail("");
      setPartySize("1");
      setNotes("");
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на гостинот.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(guestId: string, status: RsvpStatus) {
    setError(null);
    try {
      const updated = await jsonOrThrow(
        await fetch(`/api/couple/guests/${guestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "status", rsvp_status: status }),
        }),
      );
      setGuests((prev) => prev.map((g) => (g.id === guestId ? updated : g)));
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на статусот.");
    }
  }

  async function handleSideChange(guestId: string, newSide: GuestSide) {
    setError(null);
    try {
      const updated = await jsonOrThrow(
        await fetch(`/api/couple/guests/${guestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "side", side: newSide }),
        }),
      );
      setGuests((prev) => prev.map((g) => (g.id === guestId ? updated : g)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа преместувањето на гостинот.");
    }
  }

  async function handleDelete(guestId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/guests/${guestId}`, { method: "DELETE" }));
      setGuests((prev) => prev.filter((g) => g.id !== guestId));
      await refreshStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на гостинот.");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const result = await jsonOrThrow(
        await fetch("/api/couple/guests/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: await readFileText(file) }),
        }),
      );
      await reload();
      setNotice(`Додадени: ${result.imported}. Прескокнати (веќе на листата): ${result.skipped}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа увозот на гостите.");
    } finally {
      input.value = "";
    }
  }

  const visibleGuests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter(
      (g) =>
        (!q || g.full_name.toLowerCase().includes(q) || (g.phone ?? "").toLowerCase().includes(q) || (g.email ?? "").toLowerCase().includes(q)) &&
        (!statusFilter || g.rsvp_status === statusFilter) &&
        (!menuFilter || (menuFilter === "none" ? g.menu_choice === null : g.menu_choice === menuFilter)) &&
        (!sentFilter || (sentFilter === "sent") === (g.invitation_sent_at !== null)),
    );
  }, [guests, query, statusFilter, menuFilter, sentFilter]);

  const openGuest = guests.find((g) => g.id === openGuestId) ?? null;
  const canSend = (g: Guest) => sendingEnabled && (!organizerSide || g.side === organizerSide);

  function renderGuestRow(guest: Guest) {
    const unsent = guest.invitation_sent_at === null;
    return (
      <div
        key={guest.id}
        className="ev"
        data-unsent={unsent ? "true" : "false"}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          minWidth: 0,
          borderLeft: unsent ? "3px solid var(--bad)" : undefined,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          <button
            type="button"
            onClick={() => setOpenGuestId(guest.id)}
            aria-label={`Детали за ${guest.full_name}`}
            style={{ fontWeight: 700, margin: 0, padding: 0, background: "none", border: 0, cursor: "pointer", textAlign: "left", color: "var(--ink)" }}
          >
            {guest.full_name}
          </button>
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>
            {guest.phone ?? "Нема телефон"} · {guest.party_size} {guest.party_size === 1 ? "гостин" : "гости"}
            {guest.menu_choice ? ` · ${MENU_LABELS[guest.menu_choice]}` : ""}
          </p>
          {unsent ? <p style={{ color: "var(--bad)", fontSize: 12.5, fontWeight: 600, margin: 0 }}>Неиспратена покана</p> : null}
          {guest.notes ? <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>{guest.notes}</p> : null}
          {guest.rsvp_changed_via_link_at ? (
            <p style={{ color: "var(--muted)", fontSize: 12.5, margin: 0 }}>
              Одговор преку поканата: {formatLinkChange(guest.rsvp_changed_via_link_at)}
              {guest.rsvp_previous_status
                ? ` (претходно: ${STATUS_LABELS[guest.rsvp_previous_status] ?? guest.rsvp_previous_status})`
                : ""}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minWidth: 0, maxWidth: "100%" }}>
          {canSend(guest) ? (
            <button type="button" className="btn btn-ghost" onClick={() => setOpenGuestId(guest.id)} aria-label={`Прати покана на ${guest.full_name}`}>
              Прати
            </button>
          ) : null}
          <select
            aria-label={`Статус за ${guest.full_name}`}
            className="fld"
            style={{ width: "auto", maxWidth: "100%" }}
            value={guest.rsvp_status}
            onChange={(e) => handleStatusChange(guest.id, e.target.value as RsvpStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {isWedding ? (
            <button
              type="button"
              onClick={() => handleSideChange(guest.id, guest.side === "bride" ? "groom" : "bride")}
              aria-label={`Премести ${guest.full_name} на другата страна`}
              className="btn btn-ghost"
              style={{ whiteSpace: "normal", textAlign: "left" }}
            >
              Премести на страната на {guest.side === "bride" ? "младоженецот" : "невестата"}
            </button>
          ) : null}
          <button type="button" onClick={() => handleDelete(guest.id)} aria-label={`Избриши ${guest.full_name}`} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
            Избриши
          </button>
        </div>
      </div>
    );
  }

  const brideGuests = visibleGuests.filter((g) => g.side === "bride");
  const groomGuests = visibleGuests.filter((g) => g.side === "groom");
  const unassignedGuests = visibleGuests.filter((g) => g.side === null);
  const emptyText = guests.length === 0 ? "Сè уште нема додадено гости." : "Нема гости за овој филтер.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {organizerSide ? (
        <p className="ev" style={{ margin: 0, fontSize: 14 }}>
          Најавени сте како ко-организатор за страната на {organizerSide === "bride" ? "невестата" : "младоженецот"}: ги гледате сите гости, а праќате
          покани на гостите од вашата страна.
        </p>
      ) : null}
      <div className="tiles">
        {[
          { label: "Вкупно", value: stats.total, icon: "users" },
          { label: "Потврдени", value: stats.confirmed, icon: "tick" },
          { label: "Одбиени", value: stats.declined, icon: "x" },
          { label: "Во исчекување", value: stats.pending, icon: "clock" },
          { label: "Подоцна", value: stats.later, icon: "clock" },
          { label: "Присутни", value: stats.totalAttending, icon: "occ" },
          { label: "Испратени покани", value: `${stats.invitationsSent} / ${stats.total}`, icon: "tick" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="tile">
            <span className="badge">
              <Icon name={icon} size="lg" />
            </span>
            <div>
              <div className="num">{value}</div>
              <div className="lab">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {stats.total > 0 ? <RsvpBreakdown stats={stats} /> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          type="search"
          aria-label="Пребарај гости"
          placeholder="Пребарај гости…"
          className="fld"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 220px" }}
        />
        <select aria-label="Филтер по статус" className="fld" style={FILTER_STYLE} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RsvpStatus | "")}>
          <option value="">Сите статуси</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select aria-label="Филтер по мени" className="fld" style={FILTER_STYLE} value={menuFilter} onChange={(e) => setMenuFilter(e.target.value as MenuChoice | "none" | "")}>
          <option value="">Сите менија</option>
          {MENU_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="none">Неизбрано мени</option>
        </select>
        <select aria-label="Филтер по покана" className="fld" style={FILTER_STYLE} value={sentFilter} onChange={(e) => setSentFilter(e.target.value as SentFilter)}>
          <option value="">Сите покани</option>
          <option value="sent">Испратени</option>
          <option value="unsent">Неиспратени</option>
        </select>
        {sendingEnabled ? (
          <button type="button" className="btn btn-gold" onClick={() => setBulkOpen(true)}>
            Масовно праќање
          </button>
        ) : null}
        <a href="/api/couple/guests/export" className="btn btn-ghost" download>
          Извези CSV
        </a>
        <label className="btn btn-ghost" style={{ cursor: "pointer", position: "relative" }}>
          Увези CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleImport}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
          />
        </label>
      </div>
      {notice ? <p style={{ color: "var(--ok)", fontSize: 13.5, margin: 0 }}>{notice}</p> : null}

      {isWedding ? (
        // Not the bare `grid` class: panel.css gives `.vp .grid` a 1010px min-width (tables).
        <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2">
          <div style={COLUMN_STYLE}>
            <h2 className="panel-t">Страна на невестата</h2>
            {brideGuests.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13.5 }}>{emptyText}</p> : brideGuests.map(renderGuestRow)}
          </div>
          <div style={COLUMN_STYLE}>
            <h2 className="panel-t">Страна на младоженецот</h2>
            {groomGuests.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13.5 }}>{emptyText}</p> : groomGuests.map(renderGuestRow)}
          </div>
          {unassignedGuests.length > 0 ? (
            <div className="sm:col-span-2" style={COLUMN_STYLE}>
              <h2 className="panel-t">Недоделени</h2>
              {unassignedGuests.map(renderGuestRow)}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={COLUMN_STYLE}>
          {visibleGuests.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13.5 }}>{emptyText}</p> : visibleGuests.map(renderGuestRow)}
        </div>
      )}

      <form onSubmit={handleAdd} className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 className="panel-t" style={{ margin: 0 }}>
          Додади гостин рачно
        </h2>
        <input className="fld" aria-label="Име и презиме" placeholder="Име и презиме" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="fld" aria-label="Телефон (по желба)" placeholder="Телефон (по желба)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input
          className="fld"
          type="email"
          aria-label="Email (по желба)"
          placeholder="Email (по желба)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input className="fld" type="number" aria-label="Број на лица" min={1} value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        <input className="fld" aria-label="Белешки (по желба)" placeholder="Белешки (по желба)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {isWedding ? (
          <select aria-label="Страна" className="fld" value={side} onChange={(e) => setSide(e.target.value as GuestSide)}>
            {SIDE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : null}
        {error ? (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ alignSelf: "flex-start" }}>
          {isSubmitting ? "Се додава..." : "Додади гостин"}
        </button>
      </form>

      {openGuest ? (
        <GuestDetail
          guest={openGuest}
          showSide={isWedding}
          share={share}
          actions={sendActions}
          sendBlockedBy={canSend(openGuest) || !sendingEnabled ? null : openGuest.side}
          sendingEnabled={sendingEnabled}
          greetingsEnabled={greetingsEnabled}
          onClose={closeDetail}
        />
      ) : null}
      {bulkOpen ? <BulkSendDialog guests={visibleGuests.filter(canSend)} share={share} actions={sendActions} onClose={closeBulk} /> : null}
    </div>
  );
}
