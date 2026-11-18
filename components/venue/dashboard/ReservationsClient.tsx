"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { PhoneQuickContact } from "@/components/shared/PhoneQuickContact";
import { usePaged } from "./ShowMore";
import { formatVenueDatePadded } from "@/lib/date";
import { type RoomWithSeatTotal } from "@/lib/venue/rooms";
import {
  listReservationsForDate,
  isActiveReservation,
  RESERVATION_STATUS_META,
  type Reservation,
  type ReservationStatus,
} from "@/lib/venue/reservations";
import { errorMessage } from "@/lib/venue/user-error";
import { setReservationStatusViaApi, deleteReservationViaApi } from "@/lib/venue/reservations-client";
import { getVenueLogoUrl } from "@/lib/venue/venue-profile";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
import { ReservationWizard } from "./ReservationWizard";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return todayIsoFrom(d);
}
function todayIsoFrom(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LOAD_ERROR = "Податоците за резервациите не можеа да се вчитаат.";

export function ReservationsClient({
  venueId,
  initialReservations,
  rooms,
}: {
  venueId: string;
  initialReservations: Reservation[];
  rooms: RoomWithSeatTotal[];
}) {
  const { token: managerToken } = useManagerElevation();

  // Project C: the venue's own logo, watermarked over the floor plan.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    getVenueLogoUrl(venueId)
      .then(setLogoUrl)
      .catch(() => {});
  }, [venueId]);

  // ---- overall stats (venue-wide, independent of the day being viewed) ----
  const [reservations, setReservations] = useState(initialReservations);
  // Cancelled and completed bookings stay as history (0174) but aren't counted.
  const counts = useMemo(
    () => ({
      total: reservations.filter(isActiveReservation).length,
      reserved: reservations.filter((r) => r.status === "reserved").length,
      seated: reservations.filter((r) => r.status === "seated").length,
    }),
    [reservations]
  );

  // The day being listed (and where a new booking lands afterwards).
  const [date, setDate] = useState(todayIso());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const failedToLoad = () => setLoadError(LOAD_ERROR);
  // Phones: which reservation row is expanded to show its contact + actions.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 900px)");
    if (!mq) return;
    const sync = () => setIsPhone(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  // ---- day list: every reservation on the selected date, across all rooms
  // (independently filterable), with seat/free/cancel actions ----
  const [dayReservations, setDayReservations] = useState<Reservation[]>([]);
  const [listRoomFilter, setListRoomFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!date) {
      setDayReservations([]);
      return;
    }
    // "Претходен ден" clicked twice quickly: the older day's answer must not
    // overwrite the newer one.
    let cancelled = false;
    listReservationsForDate(venueId, date)
      .then((list) => {
        if (!cancelled) setDayReservations(list);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, date, refreshTick]);

  const filteredDayReservations = dayReservations.filter((r) => {
    if (listRoomFilter !== "all" && r.room_id !== listRoomFilter) return false;
    if (search && !r.guest_name.toLowerCase().includes(search.toLowerCase()) && !r.phone.includes(search)) return false;
    return true;
  });
  // Live bookings first; cancelled/completed ones sit in a collapsed group
  // below so staff can still see the day's history.
  const activeDayReservations = filteredDayReservations.filter(isActiveReservation);
  const pastDayReservations = filteredDayReservations.filter((r) => !isActiveReservation(r));
  const [showPast, setShowPast] = useState(false);
  // 10 at a time; a new day, hall or search starts over.
  const dayPage = usePaged(activeDayReservations, `${date}|${listRoomFilter}|${search}`);

  function handleCreated(created: Reservation) {
    setWizardOpen(false);
    setReservations((prev) => [...prev, created]);
    setDate(created.date);
    if (created.date === date) setDayReservations((prev) => [...prev, created]);
    setNotice(`Резервацијата за ${created.guest_name} е зачувана (${formatVenueDatePadded(created.date)}, ${created.start_time.slice(0, 5)}).`);
  }

  function setStatusLocally(id: string, status: ReservationStatus) {
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setDayReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }
  function findReservation(id: string) {
    return dayReservations.find((r) => r.id === id) ?? reservations.find((r) => r.id === id);
  }

  // Cancelling keeps the record (status 'cancelled', audited — 0174); it
  // frees the tables and moves the row to "Откажани / завршени". Project B
  // §6: a mini event's table claim follows the event, so cancelling it
  // cancels the event itself (manager only); the event can be reopened, or
  // deleted for good, from its own page.
  async function handleCancel(id: string) {
    const reservation = findReservation(id);
    const who = reservation ? ` на ${reservation.guest_name}` : "";
    const confirmMessage = reservation?.event_id
      ? `Да се откаже мини настанот${who}? Настанот ќе биде означен како откажан и масите се ослободуваат.`
      : `Да се откаже резервацијата${who}? Масите се ослободуваат, а резервацијата останува во списокот како откажана.`;
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    try {
      await setReservationStatusViaApi(id, "cancelled", managerToken);
      setStatusLocally(id, "cancelled");
    } catch (err) {
      setError(errorMessage(err, "Не успеа откажувањето на резервацијата. Обидете се повторно."));
    }
  }

  // reserved -> seated (table now occupied); seated -> completed ("guests
  // left": the table frees up and the booking stays as history).
  async function handleToggleOccupied(id: string, currentStatus: ReservationStatus) {
    setError(null);
    const next: ReservationStatus = currentStatus === "reserved" ? "seated" : "completed";
    try {
      await setReservationStatusViaApi(id, next, managerToken);
      setStatusLocally(id, next);
    } catch (err) {
      setError(errorMessage(err, "Не успеа промената на резервацијата. Обидете се повторно."));
    }
  }

  // A cancelled booking back to "Резервирано" (the server re-checks its tables).
  async function handleRestore(id: string) {
    setError(null);
    try {
      await setReservationStatusViaApi(id, "reserved", managerToken);
      setStatusLocally(id, "reserved");
    } catch (err) {
      setError(errorMessage(err, "Не успеа враќањето на резервацијата. Обидете се повторно."));
    }
  }

  // "Избриши засекогаш": only for a cancelled/completed ordinary booking,
  // named in the question, audited with its details.
  async function handleHardDelete(id: string) {
    const r = findReservation(id);
    if (!r) return;
    const what = `${r.guest_name} (${formatVenueDatePadded(r.date)}, ${r.start_time.slice(0, 5)}, ${r.party_size} ${r.party_size === 1 ? "гостин" : "гости"})`;
    if (!window.confirm(`Да се избрише засекогаш резервацијата на ${what}? Ова не може да се врати.`)) return;
    setError(null);
    try {
      await deleteReservationViaApi(id, managerToken);
      setReservations((prev) => prev.filter((x) => x.id !== id));
      setDayReservations((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setError(errorMessage(err, "Не успеа бришењето на резервацијата. Обидете се повторно."));
    }
  }

  const today = todayIso();
  function renderRow(r: Reservation) {
    const status = RESERVATION_STATUS_META[r.status];
    const roomForRow = rooms.find((room) => room.id === r.room_id);
    const rowOpen = openRowId === r.id;
    const active = isActiveReservation(r);
    return (
      <div className={`qb-slot-row${rowOpen ? " is-open" : ""}${active ? "" : " is-inactive"}`} key={r.id}>
        {/* Phones: one compact line per reservation; tap for contact + actions. */}
        {isPhone ? (
        <button
          type="button"
          className="qb-rp-head"
          aria-expanded={rowOpen}
          aria-label={`${r.start_time.slice(0, 5)} ${r.guest_name}: детали`}
          onClick={() => setOpenRowId(rowOpen ? null : r.id)}
        >
          <span className="qb-rp-time">{r.start_time.slice(0, 5)}</span>
          <span className="qb-rp-main">
            <b>{r.guest_name}</b>
            <span>
              {[roomForRow?.name, `${r.party_size} ${r.party_size === 1 ? "гостин" : "гости"}`, r.server_name].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className={`pill ${status.pill}`}>{status.label}</span>
        </button>
        ) : null}
        <span>{r.start_time.slice(0, 5)}</span>
        <span>
          <b>{r.guest_name}</b>
          {r.event_id ? <span className="pill p-info" style={{ marginLeft: 6 }}>Мини настан</span> : null}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {r.phone}
          <PhoneQuickContact phone={r.phone} compact />
        </span>
        <span>{roomForRow?.name ?? "—"}</span>
        <span>{r.party_size}</span>
        <span>{r.server_name ?? "—"}</span>
        <span className={`pill ${status.pill}`}>{status.label}</span>
        <span className="qb-row-actions" style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {active ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => handleToggleOccupied(r.id, r.status)}>
                {r.status === "reserved" ? "Зафатена" : "Слободна"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => handleCancel(r.id)}>
                Откажи
              </button>
            </>
          ) : r.event_id ? (
            <span className="muted">Се уредува од страницата на настанот</span>
          ) : (
            <>
              {r.status === "cancelled" && r.date >= today ? (
                <button type="button" className="btn btn-ghost" onClick={() => handleRestore(r.id)}>
                  Врати
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={() => handleHardDelete(r.id)}>
                Избриши засекогаш
              </button>
            </>
          )}
        </span>
        {isPhone && rowOpen ? (
          <div className="qb-rp-detail">
            {r.event_id ? <span className="pill p-info">Мини настан</span> : null}
            <span className="qb-rp-phone">
              <Icon name="phone" size="sm" />
              {r.phone}
              <PhoneQuickContact phone={r.phone} compact />
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wrap">
      <section className="tiles tiles-compact" aria-label="Преглед">
        <div className="tile">
          <span className="badge"><Icon name="book" size="lg" /></span>
          <div>
            <div className="num">{counts.total}</div>
            <div className="lab">Вкупно<span className="qb-wide-only"> резервации</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="clock" size="lg" /></span>
          <div>
            <div className="num">{counts.reserved}</div>
            <div className="lab">Резервирани</div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="users" size="lg" /></span>
          <div>
            <div className="num">{counts.seated}</div>
            <div className="lab">Зафатени</div>
          </div>
        </div>
      </section>

      <div className="qb-new-bar">
        <button type="button" className="btn btn-gold qb-new-btn" onClick={() => setWizardOpen(true)}>
          <Icon name="plus" size="sm" /> Нова резервација
        </button>
      </div>
      {notice ? (
        <p role="status" className="qb-notice">
          <Icon name="check" size="sm" /> {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", margin: 0 }}>
          {error}
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className="qb-load-error" style={{ color: "var(--bad)", margin: 0 }}>
          {loadError}{" "}
          <button type="button" className="btn btn-ghost" onClick={() => setRefreshTick((n) => n + 1)}>
            Обиди се повторно
          </button>
        </p>
      ) : null}
      {wizardOpen ? (
        <ReservationWizard venueId={venueId} rooms={rooms} logoUrl={logoUrl} onCreated={handleCreated} onClose={() => setWizardOpen(false)} />
      ) : null}

      <section className="panel qb-day">
        <div className="panel-h">
          <h2 className="panel-t">
            <Icon name="book" size="sm" /> Резервации за {formatVenueDatePadded(date)}
          </h2>
          <div className="qb-day-nav">
            <button type="button" className="sq" aria-label="Претходен ден" onClick={() => setDate((d) => addDaysIso(d, -1))}>
              <Icon name="left" size="sm" />
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDate(todayIso())}>
              Денес
            </button>
            <button type="button" className="sq" aria-label="Следен ден" onClick={() => setDate((d) => addDaysIso(d, 1))}>
              <Icon name="right" size="sm" />
            </button>
          </div>
          <div className="seg">
            <button type="button" aria-pressed={listRoomFilter === "all"} onClick={() => setListRoomFilter("all")}>
              Сите простории
            </button>
            {rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={listRoomFilter === r.id}
                aria-label={`Прикажи резервации за: ${r.name}`}
                onClick={() => setListRoomFilter(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
          <input
            className="fld"
            placeholder="Пребарај по име или телефон"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="count">{activeDayReservations.length} резервации</span>
        </div>

        {activeDayReservations.length === 0 ? (
          <div className="empty" style={{ padding: "24px 20px" }}>
            <b>Нема резервации</b>
            Нема резервации за {formatVenueDatePadded(date)} што одговараат на филтрите.
          </div>
        ) : (
          <div className="qb-slot-table">
            <div className="qb-slot-row qb-slot-head">
              <span>Време</span>
              <span>Име на клиент</span>
              <span>Телефон</span>
              <span>Сала</span>
              <span>Гости</span>
              <span>Келнер</span>
              <span>Статус</span>
              <span></span>
            </div>
            {dayPage.visible.map(renderRow)}
          </div>
        )}
        {dayPage.showMore}
        {pastDayReservations.length > 0 ? (
          <>
            <div className="qb-past-h">
              <button type="button" className="cl-done-toggle" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
                <Icon name="down" size="sm" className={showPast ? "cl-caret open" : "cl-caret"} />
                <span>Откажани / завршени ({pastDayReservations.length})</span>
              </button>
            </div>
            {showPast ? <div className="qb-slot-table qb-past">{pastDayReservations.map(renderRow)}</div> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
