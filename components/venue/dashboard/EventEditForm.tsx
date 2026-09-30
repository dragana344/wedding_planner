"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { ImageLightbox } from "./ImageLightbox";
import { MenuDetailModal } from "./MenuDetailModal";
import { EventSeatingOverlay } from "./EventSeatingOverlay";
import {
  deleteEvent,
  updateEvent,
  updateEventContactInfo,
  updateEventFinance,
  type EventDetail,
  type UpdateEventInput,
  type EventStatus,
  type EventType,
} from "@/lib/venue/events";
import { STATUS_OPTIONS, TYPE_OPTIONS } from "@/lib/venue/event-display";
import {
  addShowcasePhoto,
  deleteShowcasePhoto,
  getShowcasePhotoUrl,
  listShowcasePhotos,
  type ShowcasePhoto,
} from "@/lib/venue/showcase";
import {
  getEventUsername,
  regenerateEventPassword,
  generateRandomPassword,
} from "@/lib/venue/credentials";
import type { Room } from "@/lib/venue/rooms";
import type { MenuItem, MenuTemplate } from "@/lib/venue/menus";
import { confirmationMatches } from "@/lib/privacy/confirm";
import { parseCoupleContacts } from "@/lib/venue/event-contacts";

export function EventEditForm({
  event,
  venueId,
  rooms,
  menuTemplates,
  onClose,
  onChanged,
  readOnly = false,
}: {
  event: EventDetail;
  venueId: string;
  rooms: Room[];
  menuTemplates: (MenuTemplate & { items: MenuItem[] })[];
  onClose: () => void;
  onChanged: () => void;
  /** True for past events: every field renders disabled and save/add actions
   * are hidden, but deleting the event is still allowed either way — staff
   * choice, never automatic. */
  readOnly?: boolean;
}) {
  const [coupleNames, setCoupleNames] = useState(event.couple_names);
  const [eventDate, setEventDate] = useState(event.event_date);
  const [guestCount, setGuestCount] = useState(
    event.guest_count_estimate !== null ? String(event.guest_count_estimate) : ""
  );
  const [startTime, setStartTime] = useState(event.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(event.end_time?.slice(0, 5) ?? "");
  const [status, setStatus] = useState<EventStatus>(event.status);
  const [eventType, setEventType] = useState<EventType>(event.event_type);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(event.room_ids);
  const [viewingMenu, setViewingMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showcasePhotos, setShowcasePhotos] = useState<ShowcasePhoto[] | null>(null);
  const [isUploadingShowcase, setIsUploadingShowcase] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoadingUsername, setIsLoadingUsername] = useState(true);
  const [regeneratedPassword, setRegeneratedPassword] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState(event.contact_email ?? "");
  const [contactEmail2, setContactEmail2] = useState(event.contact_email_2 ?? "");
  const [contactPhone, setContactPhone] = useState(event.contact_phone ?? "");
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [totalPrice, setTotalPrice] = useState(event.total_price !== null ? String(event.total_price) : "");
  const [depositPaid, setDepositPaid] = useState(event.deposit_paid !== null ? String(event.deposit_paid) : "");
  const [isSavingFinance, setIsSavingFinance] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [seatingRoom, setSeatingRoom] = useState<Room | null>(null);
  // DATA-006: erase this event's couple and guest data (typed confirmation).
  const [confirmingErase, setConfirmingErase] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState("");
  const [isErasing, setIsErasing] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const canErase = confirmationMatches(eraseConfirm, event.couple_names);

  const selectedMenuTemplate = menuTemplates.find((m) => m.id === event.menu_template_id);
  const hasMenu = Boolean(selectedMenuTemplate) || event.customMenuItems.length > 0;
  const menuDisplayName = selectedMenuTemplate?.name ?? (event.customMenuItems.length > 0 ? "Сопствено мени" : "Без мени");

  async function refreshShowcasePhotos() {
    setShowcasePhotos(await listShowcasePhotos(event.id));
  }

  useEffect(() => {
    refreshShowcasePhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  useEffect(() => {
    setIsLoadingUsername(true);
    getEventUsername(event.id)
      .then(setUsername)
      .finally(() => setIsLoadingUsername(false));
  }, [event.id]);

  async function handleRegeneratePassword() {
    setRegenerateError(null);
    setIsRegenerating(true);
    try {
      const newPassword = generateRandomPassword();
      await regenerateEventPassword(event.id, newPassword);
      setRegeneratedPassword(newPassword);
    } catch (err) {
      setRegenerateError(
        err instanceof Error ? err.message : "Не успеа генерирањето на нова лозинка. Обидете се повторно."
      );
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleSaveContactInfo(e: React.FormEvent) {
    e.preventDefault();
    setContactError(null);
    // A21: the couple's email and phone stay required.
    const contacts = parseCoupleContacts({ contact_email: contactEmail, contact_phone: contactPhone, contact_email_2: contactEmail2 });
    if (!contacts.ok) {
      setContactError(contacts.error);
      return;
    }
    setIsSavingContact(true);
    try {
      await updateEventContactInfo(event.id, contacts.data);
      onChanged();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Не успеа зачувувањето на контактот. Обидете се повторно."
      );
    } finally {
      setIsSavingContact(false);
    }
  }

  async function handleSaveFinance(e: React.FormEvent) {
    e.preventDefault();
    setFinanceError(null);
    setIsSavingFinance(true);
    try {
      await updateEventFinance(event.id, {
        total_price: totalPrice === "" ? null : Number(totalPrice),
        deposit_paid: depositPaid === "" ? null : Number(depositPaid),
      });
      onChanged();
    } catch (err) {
      setFinanceError(err instanceof Error ? err.message : "Не успеа зачувувањето на финансиите. Обидете се повторно.");
    } finally {
      setIsSavingFinance(false);
    }
  }

  async function handleShowcaseUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingShowcase(true);
    try {
      await addShowcasePhoto(venueId, event.id, file);
      await refreshShowcasePhotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа прикачувањето на фотографијата. Обидете се повторно.");
    } finally {
      setIsUploadingShowcase(false);
    }
  }

  async function handleShowcaseDelete(photoId: string) {
    setError(null);
    try {
      await deleteShowcasePhoto(photoId);
      await refreshShowcasePhotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на фотографијата. Обидете се повторно.");
    }
  }

  function toggleRoom(roomId: string) {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const input: UpdateEventInput = {
        couple_names: coupleNames,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        status,
        event_type: eventType,
        guest_count_estimate: guestCount === "" ? null : Number(guestCount),
        room_ids: selectedRoomIds,
        menu_template_id: event.menu_template_id,
      };
      await updateEvent(event.id, venueId, input);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на промените. Обидете се повторно.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await deleteEvent(event.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на настанот. Обидете се повторно.");
      setIsDeleting(false);
    }
  }

  async function handleErasePersonalData(e: React.FormEvent) {
    e.preventDefault();
    if (!canErase) return;
    setEraseError(null);
    setIsErasing(true);
    try {
      const res = await fetch("/api/venue/privacy/erase-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event_id: event.id, confirm: eraseConfirm }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Не успеа бришењето на личните податоци.");
      }
      onChanged();
      onClose();
    } catch (err) {
      setEraseError(err instanceof Error ? err.message : "Не успеа бришењето на личните податоци.");
      setIsErasing(false);
    }
  }

  return (
    <div className="ev-sections">
      <div className="modal-head">
        <h2>{event.couple_names}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {readOnly ? (
            <span className="ev-hint">Само за преглед</span>
          ) : (
            <button
              className="btn btn-gold"
              type="submit"
              form="event-edit-form"
              disabled={isSubmitting || isDeleting}
            >
              {isSubmitting ? "Се зачувува..." : "Зачувај промени"}
            </button>
          )}

          {confirmingDelete ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              Да се избрише?
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="btn btn-ghost"
                style={{ color: "var(--bad)" }}
              >
                {isDeleting ? "Се брише..." : "Да, избриши"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={isDeleting}
                className="btn btn-ghost"
              >
                Откажи
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="btn btn-ghost"
              style={{ color: "var(--bad)" }}
            >
              <Icon name="trash" size="sm" /> Избриши настан
            </button>
          )}

          <button onClick={onClose} aria-label="Затвори" className="modal-close">
            <Icon name="x" size="sm" />
          </button>
        </div>
      </div>

      <form id="event-edit-form" onSubmit={handleSave} className="ev-form">
        <fieldset className="ev-form-grid" disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="ev-field ev-field-wide">
            <label className="lab-s" htmlFor="edit-couple-names">
              Имиња на славениците <span className="req">*</span>
            </label>
            <input
              id="edit-couple-names"
              className="fld"
              value={coupleNames}
              onChange={(e) => setCoupleNames(e.target.value)}
              required
            />
          </div>

          <div className="ev-field">
            <label className="lab-s" htmlFor="edit-event-date">
              Датум <span className="req">*</span>
            </label>
            <input
              id="edit-event-date"
              className="fld"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </div>

          <div className="ev-field">
            <label className="lab-s" htmlFor="edit-event-type">
              Вид на настан
            </label>
            <select
              id="edit-event-type"
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
            <label className="lab-s" htmlFor="edit-start-time">
              Почеток
            </label>
            <input
              id="edit-start-time"
              className="fld"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div className="ev-field">
            <label className="lab-s" htmlFor="edit-guest-count">
              Број на гости
            </label>
            <input
              id="edit-guest-count"
              className="fld"
              type="number"
              min={0}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
            />
          </div>

          <div className="ev-field">
            <label className="lab-s" htmlFor="edit-status">
              Статус
            </label>
            <select
              id="edit-status"
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
            <label className="lab-s" htmlFor="edit-end-time">
              Крај
            </label>
            <input
              id="edit-end-time"
              className="fld"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <div className="ev-field">
            <label className="lab-s">Мени</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
              {hasMenu ? (
                <button
                  type="button"
                  onClick={() => setViewingMenu(true)}
                  className="btn btn-ghost"
                  style={{ padding: "4px 10px", whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  Погледни мени
                </button>
              ) : null}
              <span style={{ whiteSpace: "nowrap" }}>{menuDisplayName}</span>
            </div>
          </div>
        </fieldset>

        <fieldset className="ev-fieldset" disabled={readOnly}>
          <legend className="lab-s">Простории</legend>
          <div className="ev-room-list">
            {rooms.length === 0 ? (
              <p className="ev-hint">Нема дефинирани простории за овој локал.</p>
            ) : (
              rooms.map((room) => {
                const isChecked = selectedRoomIds.includes(room.id);
                // Only a room already attached to the event has a seating layout
                // to open — a room just checked in this unsaved edit doesn't
                // exist in event_layout_elements yet.
                const canEditSeating = event.room_ids.includes(room.id);
                return (
                  <div key={room.id} className="ev-room-row-head">
                    <label className="ev-check" htmlFor={`edit-room-${room.id}`}>
                      <input
                        id={`edit-room-${room.id}`}
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRoom(room.id)}
                      />
                      {room.name}
                    </label>
                    {canEditSeating ? (
                      <button
                        type="button"
                        className="ev-room-toggle"
                        onClick={() => setSeatingRoom(room)}
                      >
                        <Icon name="tables" size="sm" />
                        Отвори седење
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </fieldset>

        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      </form>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Финансии</legend>
        <form onSubmit={handleSaveFinance}>
          <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <div className="ev-form-grid">
              <div className="ev-field">
                <label className="lab-s" htmlFor="edit-total-price">
                  Вкупна цена (МКД)
                </label>
                <input
                  id="edit-total-price"
                  className="fld"
                  type="number"
                  min={0}
                  step="0.01"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                />
              </div>
              <div className="ev-field">
                <label className="lab-s" htmlFor="edit-deposit-paid">
                  Платен капар (МКД)
                </label>
                <input
                  id="edit-deposit-paid"
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
          {financeError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: "0 0 10px" }}>{financeError}</p> : null}
          {readOnly ? null : (
            <button type="submit" className="btn btn-ghost" disabled={isSavingFinance}>
              {isSavingFinance ? "Се зачувува..." : "Зачувај финансии"}
            </button>
          )}
        </form>
      </fieldset>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Контакт на парот</legend>
        <form onSubmit={handleSaveContactInfo}>
          <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
          <div className="ev-form-grid">
            <div className="ev-field">
              <input
                className="fld"
                type="email"
                aria-label="Email на парот"
                placeholder="Email на парот"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="ev-field">
              <input
                className="fld"
                type="email"
                aria-label="Втора е-пошта (по желба)"
                placeholder="Втора е-пошта (по желба)"
                value={contactEmail2}
                onChange={(e) => setContactEmail2(e.target.value)}
              />
            </div>
            <div className="ev-field">
              <input
                className="fld"
                type="tel"
                aria-label="Телефон на парот"
                placeholder="Телефон на парот"
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>
          </fieldset>
          {contactError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: "0 0 10px" }}>{contactError}</p> : null}
          {readOnly ? null : (
            <button type="submit" className="btn btn-ghost" disabled={isSavingContact}>
              {isSavingContact ? "Се зачувува..." : "Зачувај контакт"}
            </button>
          )}
        </form>
      </fieldset>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Фотографии за промоција</legend>
        {showcasePhotos === null ? (
          <p className="ev-hint">Се вчитува...</p>
        ) : showcasePhotos.length === 0 ? (
          <p className="ev-hint" style={{ marginBottom: 10 }}>Нема фотографии сè уште.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {showcasePhotos.map((photo) => {
              const url = getShowcasePhotoUrl(photo.photo_path);
              return (
                <div key={photo.id} style={{ position: "relative" }}>
                  <button type="button" onClick={() => setLightboxUrl(url)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }} />
                  </button>
                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() => handleShowcaseDelete(photo.id)}
                      aria-label="Отстрани фотографија"
                      className="sq"
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -6,
                        width: 22,
                        height: 22,
                        color: "var(--bad)",
                        background: "var(--surface)",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {readOnly ? null : (
          <label className="btn btn-ghost" style={{ display: "inline-flex", cursor: "pointer" }}>
            <Icon name="plus" size="sm" />
            {isUploadingShowcase ? "Се прикачува..." : "Додади фотографија"}
            <input
              type="file"
              accept="image/*"
              onChange={handleShowcaseUpload}
              style={{ display: "none" }}
              disabled={isUploadingShowcase}
            />
          </label>
        )}
      </fieldset>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Пристап за паровите</legend>
        <p style={{ fontSize: 13.5, margin: "0 0 8px" }}>
          Корисничко име: <b>{isLoadingUsername ? "Се вчитува..." : username}</b>
        </p>
        {regeneratedPassword ? (
          <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--gold-lo)", margin: "0 0 8px" }}>
            Нова лозинка (се прикажува само еднаш): {regeneratedPassword}
          </p>
        ) : null}
        {regenerateError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: "0 0 8px" }}>{regenerateError}</p> : null}
        {readOnly ? null : (
          <button type="button" onClick={handleRegeneratePassword} disabled={isRegenerating} className="btn btn-ghost">
            {isRegenerating ? "Се генерира..." : "Генерирај нова лозинка"}
          </button>
        )}
      </fieldset>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Лични податоци</legend>
        {confirmingErase ? (
          <form onSubmit={handleErasePersonalData}>
            <p className="ev-hint" style={{ margin: "0 0 8px" }}>
              Трајно се бришат гостите, белешките, буџетот, агендата, локациите, поканата, фотографиите и пристапот
              за паровите, како и контактот на славениците. Датумот, просториите и финансиите остануваат.
            </p>
            <div className="ev-field ev-field-wide" style={{ marginBottom: 10 }}>
              <label className="lab-s" htmlFor="erase-confirm">
                За потврда, внесете: <b>{event.couple_names}</b>
              </label>
              <input
                id="erase-confirm"
                className="fld"
                value={eraseConfirm}
                onChange={(e) => setEraseConfirm(e.target.value)}
                autoComplete="off"
              />
            </div>
            {eraseError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: "0 0 10px" }}>{eraseError}</p> : null}
            <span style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                className="btn btn-ghost"
                style={{ color: "var(--bad)" }}
                disabled={!canErase || isErasing}
              >
                {isErasing ? "Се брише..." : "Трајно избриши"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirmingErase(false);
                  setEraseConfirm("");
                  setEraseError(null);
                }}
                disabled={isErasing}
              >
                Откажи
              </button>
            </span>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: "var(--bad)" }}
            onClick={() => setConfirmingErase(true)}
          >
            Избриши ги личните податоци за овој настан
          </button>
        )}
      </fieldset>

      {lightboxUrl ? (
        <ImageLightbox src={lightboxUrl} alt="" onClose={() => setLightboxUrl(null)} />
      ) : null}

      {viewingMenu ? (
        <MenuDetailModal
          title={menuDisplayName}
          items={selectedMenuTemplate?.items ?? event.customMenuItems}
          onClose={() => setViewingMenu(false)}
        />
      ) : null}

      {seatingRoom ? (
        <EventSeatingOverlay
          eventId={event.id}
          eventName={event.couple_names}
          room={seatingRoom}
          onClose={() => setSeatingRoom(null)}
        />
      ) : null}
    </div>
  );
}
