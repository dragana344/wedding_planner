"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EventEditForm } from "./EventEditForm";
import { Icon } from "@/components/venue/shell/Icon";
import { Modal } from "./Modal";
import { MenuDetailModal } from "./MenuDetailModal";
import { listEventsWithDetails, type EventDetail } from "@/lib/venue/events";
import { STATUS_META, TYPE_META, formatTimeRange } from "@/lib/venue/event-display";
import type { Room } from "@/lib/venue/rooms";
import type { MenuItem, MenuTemplate } from "@/lib/venue/menus";
import { localIsoDate, todayIn } from "@/lib/date";

type Filter = "all" | "upcoming" | "today" | "week" | "month" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Сите настани" },
  { key: "upcoming", label: "Претстојни" },
  { key: "today", label: "Денес" },
  { key: "week", label: "Оваа недела" },
  { key: "month", label: "Овој месец" },
  { key: "done", label: "Завршени" },
];

const MK_MONTHS = [
  "Јануари", "Февруари", "Март", "Април", "Мај", "Јуни",
  "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const MK_DAYS = ["Недела", "Понеделник", "Вторник", "Среда", "Четврток", "Петок", "Сабота"];

/** ISO date (YYYY-MM-DD) formatted as "12 Септември 2026". */
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
function formatCount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Neutral placeholder artwork for events with no showcase photo. */
function EventThumb() {
  return (
    <svg viewBox="0 0 150 104" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="150" height="104" fill="#F3EDE3" />
      <rect y="66" width="150" height="38" fill="#FBF8F3" />
      <path d="M0 66h150" stroke="#E3D8C6" strokeWidth="1.5" />
      <circle cx="74" cy="40" r="20" fill="#E8DCC6" />
      <circle cx="62" cy="34" r="8" fill="#FCF7EC" />
      <circle cx="86" cy="36" r="7" fill="#F7ECD6" />
      <circle cx="74" cy="26" r="7.5" fill="#FDFAF3" />
      <circle cx="66" cy="47" r="6.5" fill="#F1E3C9" />
      <circle cx="84" cy="48" r="6" fill="#FBF3E3" />
      <rect x="70" y="58" width="8" height="12" fill="#DFCFAF" />
    </svg>
  );
}

export function EventsClient({
  venueId,
  initialEvents,
  rooms,
  menuTemplates,
  initialFilter,
}: {
  venueId: string;
  initialEvents: EventDetail[];
  rooms: Room[];
  menuTemplates: (MenuTemplate & { items: MenuItem[] })[];
  initialFilter: Filter;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EventDetail | null>(null);
  const [viewingMenuFor, setViewingMenuFor] = useState<EventDetail | null>(null);

  const today = useMemo(() => todayIn(), []);

  // Week runs Monday–Sunday, matching the calendar view and local convention.
  const { weekEnd, monthEnd } = useMemo(() => {
    const now = new Date(`${today}T00:00:00`);
    const dow = (now.getDay() + 6) % 7;
    const end = new Date(now);
    end.setDate(now.getDate() + (6 - dow));
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      weekEnd: localIsoDate(end),
      monthEnd: localIsoDate(mEnd),
    };
  }, [today]);

  async function refresh() {
    setEvents(await listEventsWithDetails(venueId));
  }

  const stats = useMemo(
    () => ({
      total: events.length,
      upcoming: events.filter((e) => e.event_date > today).length,
      today: events.filter((e) => e.event_date === today).length,
      month: events.filter((e) => e.event_date >= today && e.event_date <= monthEnd).length,
      guests: events.reduce((sum, e) => sum + (e.guest_count_estimate ?? 0), 0),
    }),
    [events, today, monthEnd],
  );

  const visible = useMemo(() => {
    const byFilter = events.filter((e) => {
      switch (filter) {
        case "upcoming":
          return e.event_date > today;
        case "today":
          return e.event_date === today;
        case "week":
          return e.event_date >= today && e.event_date <= weekEnd;
        case "month":
          return e.event_date >= today && e.event_date <= monthEnd;
        case "done":
          return e.event_date < today;
        default:
          return true;
      }
    });
    const q = query.trim().toLowerCase();
    if (!q) return byFilter;
    return byFilter.filter((e) => e.couple_names.toLowerCase().includes(q));
  }, [events, filter, query, today, weekEnd, monthEnd]);

  return (
    <div className="wrap">
      <div className="actions">
        <Link className="btn btn-gold" href="/venue/events/new">
          <Icon name="plus" />
          ДОДАДИ НАСТАН
        </Link>
      </div>

      <section className="tiles" aria-label="Преглед">
        <div className="tile">
          <span className="badge"><Icon name="cal" size="lg" /></span>
          <div>
            <div className="num">{stats.total}</div>
            <div className="lab">Вкупно настани<span>Во сите статуси</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="party" size="lg" /></span>
          <div>
            <div className="num">{stats.upcoming}</div>
            <div className="lab">Претстојни<span>идни настани</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="check" size="lg" /></span>
          <div>
            <div className="num">{stats.today}</div>
            <div className="lab">Денес<span>настани денес</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="clock" size="lg" /></span>
          <div>
            <div className="num">{stats.month}</div>
            <div className="lab">Овој месец<span>до крајот на месецот</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="users" size="lg" /></span>
          <div>
            <div className="num">{formatCount(stats.guests)}</div>
            <div className="lab">Вкупно гости<span>во сите настани</span></div>
          </div>
        </div>
      </section>

      <div className="bar">
        <div className="chips" role="group" aria-label="Филтри">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className="chip"
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="search">
          <Icon name="search" size="sm" />
          <input
            type="search"
            placeholder="Пребарај настан..."
            aria-label="Пребарај настан"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <section className="panel">
        <div className="scroll">
          <div className="grid">
            <div className="row head" style={{ gridTemplateColumns: "minmax(330px, 1.55fr) minmax(190px, 0.85fr) minmax(215px, 0.95fr) 150px" }}>
              <div>Настан</div>
              <div>Датум и време</div>
              <div>Детали</div>
              <div>Статус</div>
            </div>

            {visible.map((event) => {
              const status = STATUS_META[event.status];
              const type = TYPE_META[event.event_type];
              const timeRange = formatTimeRange(event.start_time, event.end_time);
              const menuTemplate = menuTemplates.find((m) => m.id === event.menu_template_id);
              const menuName =
                menuTemplate?.name ??
                (event.customMenuItems.length > 0 ? `Сопствено мени (${event.customMenuItems.length})` : null);
              const hasMenuDetail = Boolean(menuTemplate) || event.customMenuItems.length > 0;
              const roomNames = event.room_ids
                .map((id) => rooms.find((r) => r.id === id)?.name)
                .filter(Boolean)
                .join(", ");

              return (
                <button
                  type="button"
                  className="row ev"
                  key={event.id}
                  onClick={() => setEditing(event)}
                  aria-label={`Отвори ${event.couple_names}`}
                  style={{
                    gridTemplateColumns: "minmax(330px, 1.55fr) minmax(190px, 0.85fr) minmax(215px, 0.95fr) 150px",
                    textAlign: "left",
                    cursor: "pointer",
                    background: "none",
                    border: 0,
                  }}
                >
                  <div className="ev-name">
                    <div className="thumb"><EventThumb /></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="ttl">{event.couple_names}</div>
                      <div className="kind">{type.label}</div>
                      {event.guest_count_estimate != null ? (
                        <div className="guests">
                          <Icon name="users" size="sm" />
                          {event.guest_count_estimate} гости
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="lines">
                    <div>
                      <Icon name="cal" size="sm" />
                      {formatDate(event.event_date)}
                    </div>
                    <div className="sub">
                      {weekdayName(event.event_date)}
                      {timeRange ? ` · ${timeRange}` : ""}
                    </div>
                  </div>

                  <div className="lines">
                    <div>
                      <Icon name="pin" size="sm" />
                      {roomNames || "Без простории"}
                    </div>
                    <div>
                      <Icon name="menu" size="sm" />
                      {hasMenuDetail ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingMenuFor(event);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              e.preventDefault();
                              setViewingMenuFor(event);
                            }
                          }}
                          style={{ textDecoration: "underline", cursor: "pointer" }}
                        >
                          {menuName}
                        </span>
                      ) : (
                        "Без мени"
                      )}
                    </div>
                    {event.seatedCount > 0 ? (
                      <div>
                        <Icon name="seats" size="sm" />
                        {event.seatedCount} поставени места
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <span className={`pill ${status.pill}`}>{status.label}</span>
                  </div>
                </button>
              );
            })}

            {visible.length === 0 ? (
              <div className="empty">
                <b>Нема настани</b>
                Нема настани што одговараат на избраниот филтер.
              </div>
            ) : null}
          </div>
        </div>

        <div className="foot">
          <div className="count">
            Прикажани {visible.length} од {events.length} настани
          </div>
        </div>
      </section>

      {editing ? (
        <Modal title={editing.couple_names} onClose={() => setEditing(null)} hideHeader>
          <EventEditForm
            event={editing}
            venueId={venueId}
            rooms={rooms}
            menuTemplates={menuTemplates}
            onClose={() => setEditing(null)}
            onChanged={() => {
              void refresh();
            }}
          />
        </Modal>
      ) : null}

      {viewingMenuFor ? (
        <MenuDetailModal
          title={menuTemplates.find((m) => m.id === viewingMenuFor.menu_template_id)?.name ?? "Сопствено мени"}
          items={
            menuTemplates.find((m) => m.id === viewingMenuFor.menu_template_id)?.items ??
            viewingMenuFor.customMenuItems
          }
          onClose={() => setViewingMenuFor(null)}
        />
      ) : null}
    </div>
  );
}
