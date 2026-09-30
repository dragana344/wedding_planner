"use client";

import { useState } from "react";
import { createEvent, updateEventContactInfo, updateEventFinance, deleteEvent } from "@/lib/venue/events";
import { createEventCredentials, generateRandomPassword } from "@/lib/venue/credentials";
import { STATUS_OPTIONS, TYPE_OPTIONS } from "@/lib/venue/event-display";
import { Icon } from "@/components/venue/shell/Icon";
import type { Room } from "@/lib/venue/rooms";
import type { MenuTemplate } from "@/lib/venue/menus";
import type { EventStatus, EventType } from "@/lib/venue/events";

export function NewEventForm({
  venueId,
  rooms,
  menuTemplates,
  onCreated,
  initialRoomIds,
  roomTotals = {},
}: {
  venueId: string;
  rooms: Room[];
  menuTemplates: MenuTemplate[];
  onCreated: () => void;
  /** Halls picked before the form opened (e.g. `?room=` from the dashboard). */
  initialRoomIds?: string[];
  /** Per hall: how many tables / seats its standard layout has, for the picker. */
  roomTotals?: Record<string, { tables: number; seats: number }>;
}) {
  const [coupleNames, setCoupleNames] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [eventType, setEventType] = useState<EventType>("wedding");
  const [status, setStatus] = useState<EventStatus>("preparation");
  const [guestCount, setGuestCount] = useState("");
  const presetRoomIds = (initialRoomIds ?? []).filter((id) => rooms.some((r) => r.id === id));
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(() =>
    presetRoomIds.length > 0 ? presetRoomIds : rooms.length === 1 ? [rooms[0].id] : [],
  );
  // B6: with several halls, the hall comes first.
  const [pickingRoom, setPickingRoom] = useState(rooms.length > 1 && presetRoomIds.length === 0);
  const [menuTemplateId, setMenuTemplateId] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactEmail2, setContactEmail2] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [depositPaid, setDepositPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleRoom(roomId: string) {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const event = await createEvent({
        venue_id: venueId,
        couple_names: coupleNames,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        event_type: eventType,
        status,
        guest_count_estimate: guestCount === "" ? null : Number(guestCount),
        room_ids: selectedRoomIds,
        menu_template_id: menuTemplateId || null,
      });

      try {
        await createEventCredentials(event.id, username, password);
        await updateEventContactInfo(event.id, {
          contact_email: contactEmail.trim() || null,
          contact_email_2: contactEmail2.trim() || null,
          contact_phone: contactPhone.trim() || null,
        });
        await updateEventFinance(event.id, {
          total_price: totalPrice === "" ? null : Number(totalPrice),
          deposit_paid: depositPaid === "" ? null : Number(depositPaid),
        });
      } catch (setupError) {
        // Compensating cleanup: don't leave an orphaned event behind if
        // setting up the couple's login fails, so the user can safely retry.
        try {
          await deleteEvent(event.id);
        } catch {
          // best-effort cleanup; surface the original error either way
        }
        throw setupError;
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа креирањето на настанот. Обидете се повторно.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pickingRoom) {
    return (
      <div className="ev-form">
        <h3 className="panel-t" style={{ marginBottom: 12 }}>
          Во која сала?
        </h3>
        <div className="s3-room-picker">
          {rooms.map((room) => {
            const picked = selectedRoomIds.includes(room.id);
            const total = roomTotals[room.id];
            return (
              <button
                key={room.id}
                type="button"
                aria-pressed={picked}
                className={`s3-room-card${picked ? " is-picked" : ""}`}
                onClick={() => toggleRoom(room.id)}
              >
                <strong>{room.name}</strong>
                <span className="muted">
                  {total ? `${total.tables} маси · ${total.seats} места` : `${room.width_cm / 100} × ${room.height_cm / 100} м`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="ev-hint">Настанот може да користи и повеќе сали.</p>
        <button type="button" className="btn btn-gold" disabled={selectedRoomIds.length === 0} onClick={() => setPickingRoom(false)}>
          Продолжи
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      {rooms.length > 1 ? (
        <p className="ev-hint">
          Сала: {rooms.filter((r) => selectedRoomIds.includes(r.id)).map((r) => r.name).join(", ") || "—"}{" "}
          <button type="button" className="btn btn-ghost" onClick={() => setPickingRoom(true)}>
            Смени сала
          </button>
        </p>
      ) : null}
      <div className="ev-form-grid">
        <div className="ev-field ev-field-wide">
          <label className="lab-s" htmlFor="couple-names">
            Имиња на славениците <span className="req">*</span>
          </label>
          <input
            id="couple-names"
            className="fld"
            placeholder="Ивана &amp; Марко"
            value={coupleNames}
            onChange={(e) => setCoupleNames(e.target.value)}
            required
          />
        </div>

        <div className="ev-field">
          <label className="lab-s" htmlFor="event-date">
            Датум <span className="req">*</span>
          </label>
          <input
            id="event-date"
            className="fld"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
          />
        </div>

        <div className="ev-field">
          <label className="lab-s" htmlFor="event-type">
            Вид на настан
          </label>
          <select
            id="event-type"
            className="fld"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as EventType)}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ev-field">
          <label className="lab-s" htmlFor="start-time">
            Почеток
          </label>
          <input
            id="start-time"
            className="fld"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>

        <div className="ev-field">
          <label className="lab-s" htmlFor="event-status">
            Статус
          </label>
          <select
            id="event-status"
            className="fld"
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ev-field">
          <label className="lab-s" htmlFor="guest-count">
            Број на гости
          </label>
          <input
            id="guest-count"
            className="fld"
            type="number"
            min={0}
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
          />
        </div>

        <div className="ev-field">
          <label className="lab-s" htmlFor="end-time">
            Крај
          </label>
          <input
            id="end-time"
            className="fld"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Простории</legend>
        <div className="ev-checks">
          {rooms.length === 0 ? (
            <p className="ev-hint">Нема дефинирани простории за овој локал.</p>
          ) : (
            rooms.map((room) => (
              <label key={room.id} className="ev-check" htmlFor={`room-${room.id}`}>
                <input
                  id={`room-${room.id}`}
                  type="checkbox"
                  checked={selectedRoomIds.includes(room.id)}
                  onChange={() => toggleRoom(room.id)}
                />
                {room.name}
              </label>
            ))
          )}
        </div>
      </fieldset>

      <div className="ev-field">
        <label className="lab-s" htmlFor="menu-template">
          Мени
        </label>
        <select
          id="menu-template"
          className="fld"
          value={menuTemplateId}
          onChange={(e) => setMenuTemplateId(e.target.value)}
        >
          <option value="">Без мени</option>
          {menuTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Пристап за паровите</legend>
        <div className="ev-form-grid">
          <div className="ev-field">
            <label className="lab-s" htmlFor="couple-username">
              Корисничко име <span className="req">*</span>
            </label>
            <input
              id="couple-username"
              className="fld"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="ev-field">
            <label className="lab-s" htmlFor="couple-password">
              Лозинка <span className="req">*</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="couple-password"
                className="fld"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                aria-describedby="couple-password-hint"
                required
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPassword(generateRandomPassword())}
              >
                Генерирај
              </button>
            </div>
            <p id="couple-password-hint" style={{ color: "var(--muted)", fontSize: 12.5, margin: "4px 0 0" }}>
              Најмалку 10 знаци.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Финансии (опционално)</legend>
        <div className="ev-form-grid">
          <div className="ev-field">
            <label className="lab-s" htmlFor="total-price">
              Вкупна цена (МКД)
            </label>
            <input
              id="total-price"
              className="fld"
              type="number"
              min={0}
              step="0.01"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
            />
          </div>
          <div className="ev-field">
            <label className="lab-s" htmlFor="deposit-paid">
              Платен капар (МКД)
            </label>
            <input
              id="deposit-paid"
              className="fld"
              type="number"
              min={0}
              step="0.01"
              value={depositPaid}
              onChange={(e) => setDepositPaid(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Контакт (опционално)</legend>
        <div className="ev-form-grid">
          <div className="ev-field">
            <input
              className="fld"
              placeholder="Е-пошта за контакт"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div className="ev-field">
            <input
              className="fld"
              placeholder="Втора е-пошта"
              type="email"
              value={contactEmail2}
              onChange={(e) => setContactEmail2(e.target.value)}
            />
          </div>
          <div className="ev-field">
            <input
              className="fld"
              placeholder="Телефон за контакт"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {error ? (
        <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p>
      ) : null}

      <button className="btn btn-gold" type="submit" disabled={isSubmitting}>
        <Icon name="plus" />
        {isSubmitting ? "Се креира..." : "Креирај настан"}
      </button>
    </form>
  );
}
