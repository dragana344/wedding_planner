"use client";

import { useEffect, useMemo, useState } from "react";
import { EventEditForm } from "./EventEditForm";
import { Modal } from "./Modal";
import { Icon } from "@/components/venue/shell/Icon";
import { useManagerElevation, reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";
import type { EventDetail, EventType } from "@/lib/venue/events";
import { STATUS_META, TYPE_META, formatTimeRange } from "@/lib/venue/event-display";
import type { Room } from "@/lib/venue/rooms";
import type { MenuItem, MenuTemplate } from "@/lib/venue/menus";
import { todayIn } from "@/lib/date";

type ClientsData = { venueId: string; events: EventDetail[]; rooms: Room[]; menuTemplates: (MenuTemplate & { items: MenuItem[] })[] };

type Tab = "all" | EventType;

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
        <div className="chips" role="group" aria-label="Филтри по вид">
          <button className="chip" type="button" aria-pressed={tab === "all"} onClick={() => setTab("all")}>
            Сите ({events.length})
          </button>
          {(Object.keys(TYPE_META) as EventType[]).map((type) => (
            <button
              key={type}
              className="chip"
              type="button"
              aria-pressed={tab === type}
              onClick={() => setTab(type)}
            >
              {TYPE_META[type].label} ({typeCounts[type]})
            </button>
          ))}
        </div>
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
            <div className="row head">
              <div>Клиент / Организатор</div>
              <div>Контакт</div>
              <div>Настан &amp; датум</div>
              <div>Финансии</div>
              <div className="end">Статус</div>
            </div>

            {visible.map((event) => {
              const status = STATUS_META[event.status];
              const type = TYPE_META[event.event_type];
              const timeRange = formatTimeRange(event.start_time, event.end_time);
              const roomNames = event.room_ids
                .map((id) => rooms.find((r) => r.id === id)?.name)
                .filter(Boolean)
                .join(", ");

              return (
                <button
                  type="button"
                  className="row ev"
                  key={event.id}
                  onClick={() => setOpenEventId(event.id)}
                  style={{ textAlign: "left", cursor: "pointer", background: "none", border: 0 }}
                >
                  <div className="ev-name">
                    <div className="avatar-circle" style={{ background: type.color }}>
                      {getInitials(event.couple_names)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="ttl">{event.couple_names}</div>
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
                    <div>{event.contact_phone ? <><Icon name="phone" size="sm" />{event.contact_phone}</> : <span className="muted">Без телефон</span>}</div>
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

                  <div className="do">
                    <span className={`pill ${status.pill}`}>{status.label}</span>
                  </div>
                </button>
              );
            })}

            {visible.length === 0 ? (
              <div className="empty">
                <b>Нема клиенти</b>
                Нема клиенти што одговараат на избраниот филтер.
              </div>
            ) : null}
          </div>
        </div>

        <div className="foot">
          <div className="count">
            Прикажани {visible.length} од {events.length} клиенти
          </div>
        </div>
      </section>

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
