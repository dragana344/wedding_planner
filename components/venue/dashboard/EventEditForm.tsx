"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";
import { ImageLightbox } from "./ImageLightbox";
import { MenuDetailModal } from "./MenuDetailModal";
import { Modal } from "./Modal";
import { PackageBuilder } from "./PackageBuilder";
import { MenuNumbersSection } from "./MenuNumbersSection";
import { ChangeBox } from "./ChangeBox";
import { EventSeatingOverlay } from "./EventSeatingOverlay";
import {
  type EventDetail,
  type UpdateEventInput,
  type EventStatus,
  type EventType,
} from "@/lib/venue/events";
import {
  deleteEventViaApi,
  updateEventViaApi,
  updateEventContactInfoViaApi,
  updateEventFinanceViaApi,
  regenerateEventPasswordViaApi,
} from "@/lib/venue/events-client";
import { fetchMenuUsage } from "@/lib/venue/menu-usage-client";
import { fetchCustomMenuEnabled, saveCustomMenuViaApi } from "@/lib/venue/custom-menu-client";
import { LockedBanner } from "@/components/entitlements/LockedBanner";
import { reportElevationRejected, useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
import { STATUS_OPTIONS, TYPE_OPTIONS } from "@/lib/venue/event-display";
import {
  getShowcasePhotoUrl,
  listShowcasePhotos,
  type ShowcasePhoto,
} from "@/lib/venue/showcase";
import { addShowcasePhotoViaApi, deleteShowcasePhotoViaApi } from "@/lib/venue/showcase-client";
import {
  getEventUsername,
  generateRandomPassword,
} from "@/lib/venue/credentials";
import type { Room } from "@/lib/venue/rooms";
import { listMenuItems, type MenuItem, type MenuTemplate } from "@/lib/venue/menus";
import { confirmationMatches } from "@/lib/privacy/confirm";
import { parseCoupleContacts } from "@/lib/venue/event-contacts";
import { errorMessage } from "@/lib/venue/user-error";
import { fetchEventChanges, type EventChangesData } from "@/lib/venue/changes-client";
import { groupBySection, unseenChanges } from "@/lib/changes/rules";
import { todayIn } from "@/lib/date";
import { DEPOSIT_OVER_TOTAL_ERROR, depositExceedsTotal } from "@/lib/venue/events";

/** Shown to plain staff instead of the couple's contacts and the money (0117). */
const PRIVATE_HINT = "Само за менаџери: најавете се како менаџер за да ги видите.";

function PrivateLoading({ failed, onRetry }: { failed: boolean; onRetry?: () => void }) {
  if (!failed) return <p className="ev-hint">Се вчитува...</p>;
  return (
    <p role="alert" className="ev-hint" style={{ color: "var(--bad)" }}>
      Податоците не можеа да се вчитаат.{" "}
      {onRetry ? (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          Обиди се повторно
        </button>
      ) : null}
    </p>
  );
}

export function EventEditForm({
  event,
  venueId,
  rooms,
  menuTemplates,
  onClose,
  onChanged,
  readOnly = false,
  privateLoaded = true,
  privateFailed = false,
  onRetryPrivate,
}: {
  event: EventDetail;
  /** For loading the venue's dishes when building the event's custom menu. */
  venueId: string;
  rooms: Room[];
  menuTemplates: (MenuTemplate & { items: MenuItem[] })[];
  onClose: () => void;
  onChanged: () => void;
  /** True for past events: every field renders disabled and save/add actions
   * are hidden, but deleting the event is still allowed either way — staff
   * choice, never automatic. */
  readOnly?: boolean;
  /** Whether `event` carries the manager-only contacts and money (0117).
   * False while they are still loading for a manager — the two sections
   * wait rather than show empty fields that a save would write back. */
  privateLoaded?: boolean;
  /** Loading them failed — say so and offer a retry instead of waiting forever. */
  privateFailed?: boolean;
  onRetryPrivate?: () => void;
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
  const { managerName, token: managerToken } = useManagerElevation();
  const router = useRouter();
  // Final review finding (venue-manager-staff-login Plan 2): this form let
  // unelevated staff fill out every field and only learned they lacked
  // permission from a 403 at submit time — every write action here now
  // disables the same way the existing readOnly (past-event) gate already
  // does, instead of surfacing that only after the fact.
  const canEdit = Boolean(managerName);
  const locked = readOnly || !canEdit;
  // The couple's changes the venue has not seen; a failed load just shows no box.
  const [changesData, setChangesData] = useState<EventChangesData | null>(null);
  const [changesReload, setChangesReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchEventChanges(event.id, managerToken)
      .then((data) => {
        if (!cancelled) setChangesData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event.id, managerToken, changesReload]);
  const unseen = changesData
    ? groupBySection(unseenChanges(changesData.changes, "venue", changesData.seen, { eventDate: event.event_date, today: todayIn(), coupleFirstLoginAt: null }))
    : {};
  const guestCountChanges = unseen.guest_count ?? [];
  const contactChanges = unseen.contact ?? [];
  // After Видено: reload this window, the events list and the server-rendered
  // shell (the Настани badge counts what is unseen).
  function handleChangesSeen() {
    onChanged();
    setChangesReload((n) => n + 1);
    router.refresh();
  }
  function handleNumbersChanged() {
    onChanged();
    router.refresh();
  }
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

  // Multi-menu: every menu on the event toggles, standard packages and the
  // event's own custom menu alike (taking the custom menu off deletes it).
  const [menuIds, setMenuIds] = useState<string[]>(event.menus.map((m) => m.id));
  // What this window saw when it opened: the save sends only the difference
  // from it, so a menu another tab added meanwhile is never dropped.
  const [seenMenuIds] = useState<string[]>(() => event.menus.map((m) => m.id));
  // A custom menu saved in this window before the refreshed event arrives:
  // kept selected so saving the form right away does not drop it.
  const [savedCustomMenu, setSavedCustomMenu] = useState<{ id: string; name: string; itemIds: string[] } | null>(null);
  const eventCustomMenu = event.menus.find((m) => m.isCustom) ?? null;
  const customMenu =
    savedCustomMenu && savedCustomMenu.id !== eventCustomMenu?.id
      ? { id: savedCustomMenu.id, name: savedCustomMenu.name, itemIds: savedCustomMenu.itemIds }
      : eventCustomMenu
        ? { id: eventCustomMenu.id, name: eventCustomMenu.name, itemIds: eventCustomMenu.items.map((i) => i.id) }
        : null;
  const extraMenus = [
    ...event.menus.filter((m) => !menuTemplates.some((t) => t.id === m.id)),
    ...(savedCustomMenu && !event.menus.some((m) => m.id === savedCustomMenu.id)
      ? [{ id: savedCustomMenu.id, name: savedCustomMenu.name, isCustom: true, items: [] }]
      : []),
  ];
  const menuName = (id: string) => menuTemplates.find((t) => t.id === id)?.name ?? extraMenus.find((m) => m.id === id)?.name;
  const [menuUsage, setMenuUsage] = useState<Record<string, number> | null>(null);
  const usageRequested = useRef(false);
  const [viewingMenuId, setViewingMenuId] = useState<string | null>(null);
  // Whether the plan includes the custom menu; null until known (manager only).
  const [customMenuEnabled, setCustomMenuEnabled] = useState<boolean | null>(null);
  // The dish pool for the custom-menu builder; null while it is closed.
  const [customMenuDishes, setCustomMenuDishes] = useState<MenuItem[] | null>(null);
  const [customMenuError, setCustomMenuError] = useState<string | null>(null);
  const removedMenuIds = event.menus.map((m) => m.id).filter((id) => !menuIds.includes(id));

  /** Menus added to / removed from the selection, relative to what the window saw
   * (a custom menu saved in this window counts as already present). */
  function diffMenus() {
    const seen = new Set(seenMenuIds);
    if (savedCustomMenu) seen.add(savedCustomMenu.id);
    const now = new Set(menuIds);
    return {
      added_menu_ids: [...now].filter((id) => !seen.has(id)),
      removed_menu_ids: [...seen].filter((id) => !now.has(id)),
    };
  }

  function toggleMenu(id: string) {
    const removing = menuIds.includes(id);
    setMenuIds(removing ? menuIds.filter((x) => x !== id) : [...menuIds, id]);
    if (removing && !usageRequested.current) {
      usageRequested.current = true;
      fetchMenuUsage(event.id, managerToken)
        .then(setMenuUsage)
        // No count available: the save itself is still safe, only the hint is lost.
        .catch(() => { usageRequested.current = false; });
    }
  }

  useEffect(() => {
    if (!canEdit || readOnly) return;
    let active = true;
    fetchCustomMenuEnabled(event.id, managerToken).then((enabled) => {
      if (active) setCustomMenuEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, [event.id, managerToken, canEdit, readOnly]);

  async function openCustomMenuBuilder() {
    setCustomMenuError(null);
    try {
      setCustomMenuDishes(await listMenuItems(venueId));
    } catch (err) {
      setCustomMenuError(errorMessage(err, "Не успеа вчитувањето на јадењата. Обидете се повторно."));
    }
  }

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
      await regenerateEventPasswordViaApi(event.id, newPassword, managerToken);
      setRegeneratedPassword(newPassword);
    } catch (err) {
      setRegenerateError(
        errorMessage(err, "Не успеа генерирањето на нова лозинка. Обидете се повторно.")
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
      await updateEventContactInfoViaApi(event.id, contacts.data, managerToken);
      onChanged();
    } catch (err) {
      setContactError(
        errorMessage(err, "Не успеа зачувувањето на контактот. Обидете се повторно.")
      );
    } finally {
      setIsSavingContact(false);
    }
  }

  async function handleSaveFinance(e: React.FormEvent) {
    e.preventDefault();
    setFinanceError(null);
    if (depositExceedsTotal(totalPrice, depositPaid)) {
      setFinanceError(DEPOSIT_OVER_TOTAL_ERROR);
      return;
    }
    setIsSavingFinance(true);
    try {
      await updateEventFinanceViaApi(event.id, {
        total_price: totalPrice === "" ? null : Number(totalPrice),
        deposit_paid: depositPaid === "" ? null : Number(depositPaid),
      }, managerToken);
      onChanged();
    } catch (err) {
      setFinanceError(errorMessage(err, "Не успеа зачувувањето на финансиите. Обидете се повторно."));
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
      await addShowcasePhotoViaApi(event.id, file, managerToken);
      await refreshShowcasePhotos();
    } catch (err) {
      setError(errorMessage(err, "Не успеа прикачувањето на фотографијата. Обидете се повторно."));
    } finally {
      setIsUploadingShowcase(false);
    }
  }

  async function handleShowcaseDelete(photoId: string) {
    setError(null);
    try {
      await deleteShowcasePhotoViaApi(event.id, photoId, managerToken);
      await refreshShowcasePhotos();
    } catch (err) {
      setError(errorMessage(err, "Не успеа бришењето на фотографијата. Обидете се повторно."));
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
        ...diffMenus(),
      };
      await updateEventViaApi(event.id, input, managerToken);
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Не успеа зачувувањето на промените. Обидете се повторно."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await deleteEventViaApi(event.id, managerToken);
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Не успеа бришењето на настанот. Обидете се повторно."));
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
        headers: {
          "content-type": "application/json",
          ...(managerToken ? { "x-venue-manager-token": managerToken } : {}),
        },
        body: JSON.stringify({ event_id: event.id, confirm: eraseConfirm }),
      });
      if (!res.ok) {
        // A 403: the manager login is no longer valid — drop it everywhere.
        if (res.status === 403) reportElevationRejected();
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Не успеа бришењето на личните податоци.");
      }
      onChanged();
      onClose();
    } catch (err) {
      setEraseError(errorMessage(err, "Не успеа бришењето на личните податоци."));
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
          ) : !canEdit ? (
            <span className="ev-hint">Потребна е најава како менаџер за уредување</span>
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
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="btn btn-ghost"
              style={{ color: "var(--bad)" }}
            >
              <Icon name="trash" size="sm" /> Избриши настан
            </button>
          ) : null}

          <button onClick={onClose} aria-label="Затвори" className="modal-close">
            <Icon name="x" size="sm" />
          </button>
        </div>
      </div>

      <form id="event-edit-form" onSubmit={handleSave} className="ev-form">
        <fieldset className="ev-form-grid" disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
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

          <div className={guestCountChanges.length > 0 ? "ev-field ev-changed" : "ev-field"}>
            <ChangeBox eventId={event.id} section="guest_count" changes={guestCountChanges} canConfirm={canEdit} token={managerToken} onSeen={handleChangesSeen} />
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
            <span className="lab-s" id="edit-menus-label">Мени</span>
            <div role="group" aria-labelledby="edit-menus-label" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {menuTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="btn btn-ghost"
                  aria-pressed={menuIds.includes(template.id)}
                  disabled={locked}
                  onClick={() => toggleMenu(template.id)}
                  style={menuIds.includes(template.id) ? { fontWeight: 700, outline: "2px solid currentColor" } : undefined}
                >
                  {template.name}
                </button>
              ))}
              {extraMenus.map((menu) => (
                <button
                  key={menu.id}
                  type="button"
                  className="btn btn-ghost"
                  aria-pressed={menuIds.includes(menu.id)}
                  disabled={locked}
                  onClick={() => toggleMenu(menu.id)}
                  style={menuIds.includes(menu.id) ? { fontWeight: 700, outline: "2px solid currentColor" } : undefined}
                >
                  {menu.name}
                </button>
              ))}
              {menuTemplates.length === 0 && extraMenus.length === 0 ? <span>Без мени</span> : null}
            </div>
            {menuIds.map((id) => {
              const name = menuName(id);
              if (!name) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewingMenuId(id)}
                  className="btn btn-ghost"
                  style={{ padding: "4px 10px", marginTop: 6, marginRight: 6 }}
                >
                  Погледни мени: {name}
                </button>
              );
            })}
            {canEdit && !readOnly ? (
              <div style={{ marginTop: 6 }}>
                {customMenuEnabled === false ? (
                  <LockedBanner audience="venue" />
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={openCustomMenuBuilder}>
                    {customMenu ? "Уреди сопствено мени" : "+ Сопствено мени"}
                  </button>
                )}
                {customMenuError ? (
                  <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: "6px 0 0" }}>{customMenuError}</p>
                ) : null}
              </div>
            ) : null}
            {removedMenuIds
              .filter((id) => (menuUsage?.[id] ?? 0) > 0)
              .map((id) => (
                <p key={id} role="status" className="ev-warn" style={{ margin: "6px 0 0" }}>
                  {menuName(id) ?? "Мени"}: {menuUsage?.[id]} гости го избрале ова мени — нивниот избор ќе се избрише
                </p>
              ))}
          </div>
        </fieldset>

        {/* Not disabled as a whole: the room checkboxes lock like every other
            field, but "Отвори седење" stays open to everyone — staff and past
            events get the plan look-only (VenueEventSeating). */}
        <fieldset className="ev-fieldset">
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
                        disabled={locked}
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

      <MenuNumbersSection
        eventId={event.id}
        menuNumbers={event.menuNumbers}
        eventDate={event.event_date}
        createdAt={event.created_at}
        menus={event.menus}
        lastReminderAt={changesData?.lastReminderAt ?? null}
        // Contacts are manager-only: plain staff never get the phone.
        couplePhone={canEdit && privateLoaded ? event.contact_phone : null}
        canConfirm={canEdit} token={managerToken} onChanged={handleNumbersChanged} />

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Финансии</legend>
        {!canEdit ? (
          <p className="ev-hint">{PRIVATE_HINT}</p>
        ) : !privateLoaded ? (
          <PrivateLoading failed={privateFailed} onRetry={onRetryPrivate} />
        ) : (
          <form onSubmit={handleSaveFinance}>
            <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
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
            {locked ? null : (
              <button type="submit" className="btn btn-ghost" disabled={isSavingFinance}>
                {isSavingFinance ? "Се зачувува..." : "Зачувај финансии"}
              </button>
            )}
          </form>
        )}
      </fieldset>

      <fieldset className={contactChanges.length > 0 ? "ev-fieldset ev-changed" : "ev-fieldset"}>
        <legend className="lab-s">Контакт на парот</legend>
        <ChangeBox eventId={event.id} section="contact" changes={contactChanges} canConfirm={canEdit} token={managerToken} onSeen={handleChangesSeen} />
        {!canEdit ? (
          <p className="ev-hint">{PRIVATE_HINT}</p>
        ) : !privateLoaded ? (
          <PrivateLoading failed={privateFailed} onRetry={onRetryPrivate} />
        ) : (
          <form onSubmit={handleSaveContactInfo}>
            <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
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
            {locked ? null : (
              <button type="submit" className="btn btn-ghost" disabled={isSavingContact}>
                {isSavingContact ? "Се зачувува..." : "Зачувај контакт"}
              </button>
            )}
          </form>
        )}
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
                  {locked ? null : (
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
        {locked ? null : (
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
        {locked ? null : (
          <button type="button" onClick={handleRegeneratePassword} disabled={isRegenerating} className="btn btn-ghost">
            {isRegenerating ? "Се генерира..." : "Генерирај нова лозинка"}
          </button>
        )}
      </fieldset>

      <fieldset className="ev-fieldset">
        <legend className="lab-s">Лични податоци</legend>
        {!canEdit ? (
          // Gated on !canEdit specifically, not the combined `locked` (which
          // also folds in readOnly/past-event) — erase is deliberately still
          // available on past events, same as deleting the whole event
          // above ("staff choice, never automatic"). The server already
          // requires manager elevation for this endpoint
          // (requireManagerElevation in app/api/venue/privacy/erase-event);
          // this is purely a UI-consistency fix (security review minor
          // finding) so unelevated staff don't get to fill out a destructive
          // confirmation form only to have it rejected at submit, unlike
          // every other mutating section on this page.
          <p className="ev-hint">Само менаџер или сопственик може да ги избрише личните податоци.</p>
        ) : confirmingErase ? (
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

      {customMenuDishes ? (
        <Modal title="Сопствено мени" onClose={() => setCustomMenuDishes(null)} wide hideHeader>
          <PackageBuilder
            venueId={venueId}
            template={{ id: customMenu?.id ?? "", venue_id: venueId, name: customMenu?.name ?? "Сопствено мени", description: null }}
            initialItemIds={customMenu?.itemIds ?? []}
            items={customMenuDishes}
            allowDelete={false}
            onSave={async ({ name, itemIds }) => {
              const saved = await saveCustomMenuViaApi(event.id, { name, itemIds }, managerToken);
              setSavedCustomMenu({ id: saved.id, name, itemIds });
              setMenuIds((ids) => (ids.includes(saved.id) ? ids : [...ids, saved.id]));
            }}
            onClose={() => setCustomMenuDishes(null)}
            onChanged={onChanged}
          />
        </Modal>
      ) : null}

      {lightboxUrl ? (
        <ImageLightbox src={lightboxUrl} alt="" onClose={() => setLightboxUrl(null)} />
      ) : null}

      {viewingMenuId ? (
        <MenuDetailModal
          title={menuName(viewingMenuId) ?? "Мени"}
          items={menuTemplates.find((t) => t.id === viewingMenuId)?.items ?? event.menus.find((m) => m.id === viewingMenuId)?.items ?? []}
          onClose={() => setViewingMenuId(null)}
        />
      ) : null}

      {seatingRoom ? (
        <EventSeatingOverlay
          eventId={event.id}
          eventName={event.couple_names}
          room={seatingRoom}
          pastEvent={readOnly}
          onClose={() => setSeatingRoom(null)}
        />
      ) : null}
    </div>
  );
}
