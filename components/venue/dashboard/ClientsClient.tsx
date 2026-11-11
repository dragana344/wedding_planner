"use client";

import { useEffect, useMemo, useState } from "react";
import { EventEditForm } from "./EventEditForm";
import { Modal } from "./Modal";
import { EventTypeFilter, type TypeFilterValue } from "./EventTypeFilter";
import { usePaged } from "./ShowMore";
import { Icon } from "@/components/venue/shell/Icon";
import { PhoneQuickContact } from "@/components/shared/PhoneQuickContact";
import { useManagerElevation, reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";
import type { EventDetail, EventType } from "@/lib/venue/events";
import { STATUS_META, TYPE_META, eventTypeLabel, formatTimeRange } from "@/lib/venue/event-display";
import type { Room } from "@/lib/venue/rooms";
import type { MenuItem, MenuTemplate } from "@/lib/venue/menus";
import { todayIn } from "@/lib/date";
import { deleteEventViaApi } from "@/lib/venue/events-client";
import { errorMessage } from "@/lib/venue/user-error";

type ClientsData = { venueId: string; events: EventDetail[]; rooms: Room[]; menuTemplates: (MenuTemplate & { items: MenuItem[] })[] };

type Tab = TypeFilterValue;

const MK_MONTHS = [
  "Јануари", "Февруари", "Март", "Април", "Мај", "Јуни",
  "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const MK_DAYS = ["Недела", "Понеделник", "Вторник", "Среда", "Четврток", "Петок", "Сабота"];

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function weekdayName(iso: string) {
  return MK_DAYS[new Date(`${iso}T00:00:00`).getDay()];
}

// Intl's mk-MK thousands-separator formatting differs between Node (SSR) and
// the browser (client render), which trips a hydration mismatch — so this
// formats manually instead of via toLocaleString.
function formatMoney(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatFinance(event: EventDetail): string {
  if (event.total_price === null && event.deposit_paid === null) return "—";
  const deposit = event.deposit_paid !== null ? formatMoney(event.deposit_paid) : "0";
  const total = event.total_price !== null ? formatMoney(event.total_price) : "?";
  return `${deposit} / ${total} МКД`;
}

/** "Ана & Филип" → "АФ"; falls back to the first two letters of a single name. */
function getInitials(name: string): string {
  const parts = name
    .split(/&|,/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

async function fetchClientsData(managerToken: string, signal?: AbortSignal): Promise<ClientsData> {
  const res = await fetch("/api/venue/clients", { headers: { "x-venue-manager-token": managerToken }, signal });
  if (!res.ok) {
    if (res.status === 403) reportElevationRejected();
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Клиентите не можеа да се вчитаат.");
  }
  return res.json();
}

export function ClientsClient() {
  const { managerName, token: managerToken } = useManagerElevation();
  const [data, setData] = useState<ClientsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const today = useMemo(() => todayIn(), []);

  useEffect(() => {
    if (!managerToken) {
      setData(null);
      setLoadError(null); // a stale failure must not greet the next login
      return;
    }
    const controller = new AbortController();
    fetchClientsData(managerToken, controller.signal)
      .then(setData)
      .catch((err) => {
        if (err?.name === "AbortError") return; // superseded by a newer token
        setLoadError(err instanceof Error ? err.message : "Клиентите не можеа да се вчитаат.");
      });
    return () => controller.abort();
  }, [managerToken]);

  const events = useMemo(() => data?.events ?? [], [data]);
  const rooms = data?.rooms ?? [];
  const menuTemplates = data?.menuTemplates ?? [];

  async function refresh() {
    if (!managerToken) return;
    setData(await fetchClientsData(managerToken));
  }

  const typeCounts = useMemo(() => {
    const counts = Object.fromEntries((Object.keys(TYPE_META) as EventType[]).map((t) => [t, 0])) as Record<EventType, number>;
    for (const e of events) counts[e.event_type]++;
    return counts;
  }, [events]);

  const visible = useMemo(() => {
    const byTab = tab === "all" ? events : events.filter((e) => e.event_type === tab);
    const q = query.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (e) =>
        e.couple_names.toLowerCase().includes(q) ||
        (e.contact_email ?? "").toLowerCase().includes(q) ||
        (e.contact_phone ?? "").toLowerCase().includes(q)
    );
  }, [events, tab, query]);

  // Finished = its day has passed, or it was marked completed (same rule as
  // Настани's "Завршени"). Active ones nearest first; finished newest first.
  const [activeVisible, finishedVisible] = useMemo(() => {
    const isFinished = (e: EventDetail) => e.event_date < today || e.status === "completed";
    return [
      visible.filter((e) => !isFinished(e)).sort((a, b) => a.event_date.localeCompare(b.event_date)),
      visible.filter(isFinished).sort((a, b) => b.event_date.localeCompare(a.event_date)),
    ];
  }, [visible, today]);
  // Each list shows 10 rows at a time; a new filter or search starts over.
  const pageKey = `${tab}|${query}`;
  const activePage = usePaged(activeVisible, pageKey);
  const finishedPage = usePaged(finishedVisible, pageKey);

  async function handleDelete(eventId: string) {
    setDeleteError(null);
    setDeletingId(eventId);
    try {
      await deleteEventViaApi(eventId, managerToken);
      setConfirmDeleteId(null);
      await refresh();
    } catch (err) {
      setDeleteError({ id: eventId, message: errorMessage(err, "Не успеа бришењето. Обидете се повторно.") });
    } finally {
      setDeletingId(null);
    }
  }

  const openEvent = events.find((e) => e.id === openEventId) ?? null;
  const isOpenEventPast = openEvent ? openEvent.event_date < today : false;

  if (!managerName) {
    return (
      <div className="wrap">
        <p className="muted" style={{ padding: 24 }}>
          Само менаџер или сопственик може да пристапи до клиентите. Најавете се како менаџер од менито горе десно.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="wrap">
        {loadError ? (
          <p role="alert" style={{ padding: 24 }}>{loadError}</p>
        ) : (
          <p className="muted" style={{ padding: 24 }}>Се вчитува...</p>
        )}
      </div>
    );
  }

  const tableHead = (
    <div className="row head">
      <div>Клиент / Организатор</div>
      <div>Контакт</div>
      <div>Настан &amp; датум</div>
      <div>Финансии</div>
      <div className="end">Статус</div>
    </div>
  );

  function renderRow(event: EventDetail, finished: boolean) {
    const status = STATUS_META[event.status];
    const type = { ...TYPE_META[event.event_type], label: eventTypeLabel(event) };
    const timeRange = formatTimeRange(event.start_time, event.end_time);
    const roomNames = event.room_ids
      .map((id) => rooms.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    const cells = (
      <>
        <div className="ev-name">
          <div className="avatar-circle" style={{ background: finished ? "#a3a6ae" : type.color }}>
            {getInitials(event.couple_names)}
          </div>
          <div style={{ minWidth: 0 }}>
            {finished ? (
              // A real button for keyboard users; the whole row also opens on click.
              <button type="button" className="ttl cl-open" onClick={() => setOpenEventId(event.id)}>
                {event.couple_names}
              </button>
            ) : (
              <div className="ttl">{event.couple_names}</div>
            )}
            <div className="kind">
              <Icon name={type.icon} size="sm" /> {type.label}
            </div>
            {event.guest_count_estimate != null ? (
              <div className="guests">
                <Icon name="users" size="sm" />
                {event.guest_count_estimate} гости
              </div>
            ) : null}
          </div>
        </div>

        <div className="lines">
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {event.contact_phone ? (
              <>
                <Icon name="phone" size="sm" />
                {event.contact_phone}
                <PhoneQuickContact phone={event.contact_phone} compact />
              </>
            ) : (
              <span className="muted">Без телефон</span>
            )}
          </div>
          <div className="sub">{event.contact_email ?? "Без е-пошта"}</div>
        </div>

        <div className="lines">
          <div>
            <Icon name="cal" size="sm" />
            {formatDate(event.event_date)}
          </div>
          <div className="sub">
            {weekdayName(event.event_date)}
            {timeRange ? ` · ${timeRange}` : ""}
            {roomNames ? ` · ${roomNames}` : ""}
          </div>
        </div>

        <div
          style={{
            fontFamily: "var(--data)",
            fontSize: 13.5,
            fontWeight: event.total_price !== null || event.deposit_paid !== null ? 700 : 400,
            color: event.total_price !== null || event.deposit_paid !== null ? "var(--ink)" : "var(--faint)",
          }}
        >
          {formatFinance(event)}
        </div>
      </>
    );

    if (!finished) {
      return (
        <button
          type="button"
          className="row ev"
          key={event.id}
          onClick={() => setOpenEventId(event.id)}
          style={{ textAlign: "left", cursor: "pointer", background: "none", border: 0 }}
        >
          {cells}
          <div className="do">
            <span className={`pill ${status.pill}`}>{status.label}</span>
          </div>
        </button>
      );
    }

    const confirming = confirmDeleteId === event.id;
    const busy = deletingId === event.id;
    return (
      <div className="row ev cl-done-row" key={event.id} onClick={() => setOpenEventId(event.id)}>
        {cells}
        <div className="do cl-do" onClick={(e) => e.stopPropagation()}>
          {confirming ? (
            <span className="cl-confirm" role="group" aria-label={`Бришење на ${event.couple_names}`}>
              <button type="button" className="cl-del-yes" onClick={() => handleDelete(event.id)} disabled={busy}>
                {busy ? "Се брише..." : "Избриши"}
              </button>
              <button type="button" className="cl-del-no" onClick={() => setConfirmDeleteId(null)} disabled={busy}>
                Откажи
              </button>
            </span>
          ) : (
            <>
              <span className={`pill ${status.pill}`}>{status.label}</span>
              <button
                type="button"
                className="cl-del"
                aria-label={`Избриши го настанот ${event.couple_names}`}
                title="Избриши"
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDeleteId(event.id);
                }}
              >
                <Icon name="trash" size="sm" /> Избриши
              </button>
            </>
          )}
          {deleteError?.id === event.id ? <span role="alert" className="cl-del-err">{deleteError.message}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <section className="tiles" aria-label="Преглед" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <div className="tile">
          <span className="badge"><Icon name="user" size="lg" /></span>
          <div>
            <div className="num">{events.length}</div>
            <div className="lab">Вкупно клиенти<span>сите настани</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="heart" size="lg" /></span>
          <div>
            <div className="num">{typeCounts.wedding}</div>
            <div className="lab">Свадби<span>{TYPE_META.wedding.label}</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="case" size="lg" /></span>
          <div>
            <div className="num">{typeCounts.corporate}</div>
            <div className="lab">Корпоративни<span>настани</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="gift" size="lg" /></span>
          <div>
            <div className="num">{events.length - typeCounts.wedding - typeCounts.corporate}</div>
            <div className="lab">Останати<span>родендени, крштевки и др.</span></div>
          </div>
        </div>
      </section>

      <div className="bar">
        <EventTypeFilter value={tab} counts={typeCounts} total={events.length} onChange={setTab} />
        <div className="search">
          <Icon name="search" size="sm" />
          <input
            type="search"
            placeholder="Пребарај по име, е-пошта, телефон..."
            aria-label="Пребарај клиент"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <section className="panel">
        <div className="scroll">
          <div className="grid">
            {tableHead}
            {activePage.visible.map((event) => renderRow(event, false))}
            {activePage.showMore}
            {activeVisible.length === 0 ? (
              <div className="empty">
                <b>Нема активни клиенти</b>
                {finishedVisible.length > 0 ? "Сите што одговараат на филтерот се завршени — погледнете подолу." : "Нема клиенти што одговараат на избраниот филтер."}
              </div>
            ) : null}
          </div>
        </div>
        <div className="foot">
          <div className="count">
            Активни: {activeVisible.length} · Завршени: {finishedVisible.length} · Вкупно {events.length} клиенти
          </div>
        </div>
      </section>

      {finishedVisible.length > 0 ? (
        <section className="panel cl-done" aria-label="Завршени настани">
          <div className="panel-h">
            <button type="button" className="cl-done-toggle" aria-expanded={showFinished} onClick={() => setShowFinished((v) => !v)}>
              <Icon name="down" size="sm" className={showFinished ? "cl-caret open" : "cl-caret"} />
              <span className="card-t">Завршени настани</span>
              <span className="tf-count">{finishedVisible.length}</span>
            </button>
            <span className="ev-hint">Поминати или означени како завршени. Менаџерот може да ги избрише.</span>
          </div>
          {showFinished ? (
            <div className="scroll">
              <div className="grid">
                {tableHead}
                {finishedPage.visible.map((event) => renderRow(event, true))}
                {finishedPage.showMore}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {openEvent ? (
        <Modal title={openEvent.couple_names} onClose={() => setOpenEventId(null)} hideHeader>
          <EventEditForm
            event={openEvent}
            venueId={data?.venueId ?? ""}
            rooms={rooms}
            menuTemplates={menuTemplates}
            onClose={() => setOpenEventId(null)}
            onChanged={() => {
              void refresh();
            }}
            readOnly={isOpenEventPast}
          />
        </Modal>
      ) : null}
    </div>
  );
}

