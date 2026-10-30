"use client";

import { useEffect, useRef, useState } from "react";
import { Cormorant_Garamond } from "next/font/google";
import { findSameDayRoomEvents } from "@/lib/venue/events";
import { createEventViaApi, fetchNewEventCustomMenuEnabled } from "@/lib/venue/events-client";
import { listMenuItems, type MenuItem } from "@/lib/venue/menus";
import { Modal } from "@/components/venue/dashboard/Modal";
import { PackageBuilder } from "@/components/venue/dashboard/PackageBuilder";
import { formatTimeRange, TYPE_META } from "@/lib/venue/event-display";
import { formatMkDate, todayIn, VENUE_TIME_ZONE } from "@/lib/date";
import { parseCoupleContacts } from "@/lib/venue/event-contacts";
import { generateRandomPassword } from "@/lib/venue/credentials";
import { Icon } from "@/components/venue/shell/Icon";
import { MenuFlipModal } from "./MenuFlipModal";
import type { Room } from "@/lib/venue/rooms";
import type { EventType, EventStatus } from "@/lib/venue/events";
import { errorMessage } from "@/lib/venue/user-error";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
import {
  initialWizardState,
  nameChanged,
  validateStep,
  wizardWho,
  wizardStepTitles,
  WIZARD_STEP_COUNT,
  type WizardState,
} from "@/lib/venue/event-wizard";
import {
  EventTypeStep,
  NameStep,
  DateTimeStep,
  GuestsStep,
  RoomsMenuStep,
  PriceStep,
  CredentialsStep,
  ContactStep,
  type MenuTemplateWithItems,
} from "./EventWizardSteps";
import { EventWizardPreview } from "./EventWizardPreview";
import { EventWizardSuccess } from "./EventWizardSuccess";

// Cyrillic subset: couple/event names are routinely Macedonian Cyrillic.
const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400", style: ["normal", "italic"] });

/** How long the type grid pauses on the picked card before auto-advancing, so the selection reads as a deliberate click, not a jump-cut. */
const TYPE_SELECT_ADVANCE_DELAY_MS = 240;

export function NewEventWizard({
  venueId,
  rooms,
  menuTemplates,
  onCreated,
  initialRoomIds,
}: {
  venueId: string;
  rooms: Room[];
  menuTemplates: MenuTemplateWithItems[];
  onCreated: () => void;
  /** Halls picked before the wizard opened (e.g. `?room=` from the dashboard). */
  initialRoomIds?: string[];
}) {
  const requestedRoomIds = (initialRoomIds ?? []).filter((id) => rooms.some((r) => r.id === id));
  // A single-hall venue has nothing to choose, so its one room starts picked
  // the same way the previous single-page form pre-checked it.
  const presetRoomIds = requestedRoomIds.length > 0 ? requestedRoomIds : rooms.length === 1 ? [rooms[0].id] : [];
  const [wizard, setWizard] = useState<WizardState>(() => initialWizardState(presetRoomIds));
  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [viewingMenuIndex, setViewingMenuIndex] = useState<number | null>(null);
  // Whether the plan includes the custom menu; null until known.
  const [customMenuEnabled, setCustomMenuEnabled] = useState<boolean | null>(null);
  // The dish pool for the custom-menu builder; null while it is closed.
  const [customMenuDishes, setCustomMenuDishes] = useState<MenuItem[] | null>(null);
  const [customMenuError, setCustomMenuError] = useState<string | null>(null);

  function toggleMenu(menuTemplateId: string) {
    update({
      menuTemplateIds: wizard.menuTemplateIds.includes(menuTemplateId)
        ? wizard.menuTemplateIds.filter((id) => id !== menuTemplateId)
        : [...wizard.menuTemplateIds, menuTemplateId],
    });
  }
  const { token: managerToken } = useManagerElevation();

  useEffect(() => {
    let active = true;
    fetchNewEventCustomMenuEnabled(managerToken).then((enabled) => {
      if (active) setCustomMenuEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, [managerToken]);

  async function openCustomMenuBuilder() {
    setCustomMenuError(null);
    try {
      setCustomMenuDishes(await listMenuItems(venueId));
    } catch (err) {
      setCustomMenuError(errorMessage(err, "Не успеа вчитувањето на јадењата. Обидете се повторно."));
    }
  }

  function update(patch: Partial<WizardState>) {
    setWizard((prev) => ({ ...prev, ...patch }));
  }

  function resetWizard() {
    setWizard(initialWizardState(presetRoomIds));
    setStep(0);
    setMaxStepReached(0);
    setError(null);
    setCreated(null);
  }

  function goToStep(target: number) {
    if (target > step) {
      for (let i = step; i < target; i++) {
        const stepError = validateStep(i, wizard);
        if (stepError) {
          if (i !== step) setStep(i);
          setError(stepError);
          return;
        }
      }
    }
    setStep(target);
    setMaxStepReached((m) => Math.max(m, target));
    setError(null);
  }

  // The short pause after picking a type; cleared if the wizard closes first.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  function selectType(type: EventType) {
    update({ type });
    // Picking a type always satisfies step 0, so this skips goToStep's
    // validation loop deliberately — that loop reads `wizard` from this
    // render's closure, which setTimeout would otherwise read back stale
    // (still `type: null`) once it actually fires.
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setStep(1);
      setMaxStepReached((m) => Math.max(m, 1));
      setError(null);
    }, TYPE_SELECT_ADVANCE_DELAY_MS);
  }

  async function handleSubmit() {
    setError(null);
    for (let i = 0; i < WIZARD_STEP_COUNT; i++) {
      const stepError = validateStep(i, wizard);
      if (stepError) {
        setStep(i);
        setMaxStepReached((m) => Math.max(m, i));
        setError(stepError);
        return;
      }
    }
    const contacts = parseCoupleContacts({
      contact_email: wizard.contactEmail,
      contact_phone: wizard.contactPhone,
      contact_email_2: wizard.contactEmail2,
    });
    if (!contacts.ok) {
      setError(contacts.error);
      return;
    }
    // Two honest mistakes worth one question each before anything is saved:
    // a date that has already passed, and a hall already booked that day.
    if (wizard.date < todayIn(VENUE_TIME_ZONE) && !window.confirm(`Датумот ${formatMkDate(wizard.date)} е во минатото. Да се креира настанот сепак?`)) return;
    setIsSubmitting(true);
    try {
      let sameDay: Awaited<ReturnType<typeof findSameDayRoomEvents>> = [];
      try {
        sameDay = await findSameDayRoomEvents(venueId, wizard.date, wizard.roomIds);
      } catch {
        // The warning is a courtesy; failing to check must not block the booking.
      }
      if (sameDay.length > 0) {
        const list = sameDay
          .map((e) => `• ${e.couple_names}${formatTimeRange(e.start_time, e.end_time) ? ` (${formatTimeRange(e.start_time, e.end_time)})` : ""}`)
          .join("\n");
        if (!window.confirm(`Во избраната сала на ${formatMkDate(wizard.date)} веќе има настан:\n${list}\n\nДа се креира и овој?`)) {
          setIsSubmitting(false);
          return;
        }
      }
      // Credentials and finance travel in the same request and are set
      // server-side, atomically with the event row (security review fix —
      // create_event_credentials is no longer callable directly from the
      // browser; see lib/venue/events.ts's createEvent/CreateEventInput).
      await createEventViaApi(
        {
          venue_id: venueId,
          couple_names: wizard.name,
          event_date: wizard.date,
          start_time: wizard.startTime || null,
          end_time: wizard.endTime || null,
          event_type: wizard.type ?? "other",
          status: wizard.status,
          guest_count_estimate: wizard.guestCount,
          room_ids: wizard.roomIds,
          menu_template_ids: wizard.menuTemplateIds,
          ...(wizard.customMenu ? { custom_menu: { name: wizard.customMenu.name, item_ids: wizard.customMenu.itemIds } } : {}),
          contacts: contacts.data,
          credentials: { username: wizard.username, password: wizard.password },
          total_price: wizard.totalPrice === "" ? null : Number(wizard.totalPrice),
          deposit_paid: wizard.depositPaid === "" ? null : Number(wizard.depositPaid),
        },
        managerToken,
      );

      // The password is only ever visible here; show it before leaving.
      setCreated({ username: wizard.username, password: wizard.password });
    } catch (err) {
      setError(errorMessage(err, "Не успеа креирањето на настанот. Обидете се повторно."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className={cormorant.className}>
        <EventWizardSuccess
          typeLabel={wizard.type ? TYPE_META[wizard.type].label : ""}
          name={wizard.name}
          date={wizard.date}
          startTime={wizard.startTime}
          who={wizardWho(wizard.type)}
          username={created.username}
          password={created.password}
          onCreateAnother={resetWizard}
          onDone={onCreated}
        />
      </div>
    );
  }

  const titles = wizardStepTitles(wizard.type);
  const [title, subtitle] = titles[step];
  const showPreview = step > 0;

  return (
    <div className={`ev-wiz-layout${showPreview ? "" : " full"} ${cormorant.className}`}>
      <div className="ev-wiz-main">
        <div className="ev-wiz-head">
          <p className="ev-wiz-eyebrow">НОВ НАСТАН</p>
          <div className="ev-wiz-dots" role="group" aria-label="Чекори">
            {titles.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`ev-wiz-dot${i === step ? " cur" : i <= maxStepReached ? " done" : ""}`}
                aria-label={`Чекор ${i + 1}`}
                aria-current={i === step ? "step" : undefined}
                disabled={i > maxStepReached}
                onClick={() => goToStep(i)}
              />
            ))}
            <span className="ev-wiz-count">{step + 1} / {WIZARD_STEP_COUNT}</span>
          </div>
        </div>

        <div className="ev-wiz-fade" key={step}>
          <h2 className="ev-wiz-title">{title}</h2>
          <p className="ev-wiz-sub">{subtitle}</p>

          {step === 0 ? <EventTypeStep selected={wizard.type} onSelect={selectType} /> : null}
          {step === 1 ? <NameStep type={wizard.type} name={wizard.name} onChange={(name) => update(nameChanged(wizard, name))} /> : null}
          {step === 2 ? (
            <DateTimeStep
              date={wizard.date}
              startTime={wizard.startTime}
              endTime={wizard.endTime}
              onDateChange={(date) => update({ date })}
              onStartChange={(startTime) => update({ startTime })}
              onEndChange={(endTime) => update({ endTime })}
            />
          ) : null}
          {step === 3 ? <GuestsStep guestCount={wizard.guestCount} onChange={(guestCount) => update({ guestCount })} /> : null}
          {step === 4 ? (
            <RoomsMenuStep
              rooms={rooms}
              menuTemplates={menuTemplates}
              selectedRoomIds={wizard.roomIds}
              menuTemplateIds={wizard.menuTemplateIds}
              onToggleRoom={(roomId) =>
                update({ roomIds: wizard.roomIds.includes(roomId) ? wizard.roomIds.filter((id) => id !== roomId) : [...wizard.roomIds, roomId] })
              }
              onToggleMenu={toggleMenu}
              onClearMenus={() => update({ menuTemplateIds: [], customMenu: null })}
              onViewMenu={setViewingMenuIndex}
              customMenu={wizard.customMenu}
              customMenuEnabled={customMenuEnabled}
              customMenuError={customMenuError}
              onOpenCustomMenu={openCustomMenuBuilder}
              onRemoveCustomMenu={() => update({ customMenu: null })}
            />
          ) : null}
          {step === 5 ? (
            <PriceStep
              totalPrice={wizard.totalPrice}
              depositPaid={wizard.depositPaid}
              onTotalChange={(totalPrice) => update({ totalPrice })}
              onDepositChange={(depositPaid) => update({ depositPaid })}
            />
          ) : null}
          {step === 6 ? (
            <CredentialsStep
              username={wizard.username}
              usernameTouched={wizard.usernameTouched}
              password={wizard.password}
              onUsernameChange={(username) => update({ username, usernameTouched: true })}
              onPasswordChange={(password) => update({ password })}
              onGenerate={() => update({ password: generateRandomPassword() })}
            />
          ) : null}
          {step === 7 ? (
            <ContactStep
              email={wizard.contactEmail}
              email2={wizard.contactEmail2}
              phone={wizard.contactPhone}
              status={wizard.status}
              onEmailChange={(contactEmail) => update({ contactEmail })}
              onEmail2Change={(contactEmail2) => update({ contactEmail2 })}
              onPhoneChange={(contactPhone) => update({ contactPhone })}
              onStatusChange={(status: EventStatus) => update({ status })}
            />
          ) : null}
        </div>

        <p className="ev-wiz-err" role={error ? "alert" : undefined}>
          {error}
        </p>

        {step === 0 ? (
          <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>Кликнете на типот за да продолжите</p>
        ) : (
          <div className="ev-wiz-foot">
            <button type="button" className="btn btn-ghost" onClick={() => goToStep(Math.max(0, step - 1))}>
              <Icon name="left" size="sm" /> Назад
            </button>
            <div className="ev-wiz-foot-right">
              {step === 5 ? (
                <button type="button" className="btn btn-ghost" onClick={() => goToStep(step + 1)}>
                  Прескокни
                </button>
              ) : null}
              {step < WIZARD_STEP_COUNT - 1 ? (
                <button type="button" className="btn btn-gold" onClick={() => goToStep(step + 1)}>
                  Понатаму <Icon name="right" size="sm" />
                </button>
              ) : (
                <button type="button" className="btn btn-gold" disabled={isSubmitting} onClick={handleSubmit}>
                  <Icon name="sparkles" size="sm" /> {isSubmitting ? "Се креира..." : "Креирај настан"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showPreview ? <EventWizardPreview state={wizard} rooms={rooms} menuTemplates={menuTemplates} maxStepReached={maxStepReached} /> : null}

      {customMenuDishes ? (
        <Modal title="Сопствено мени" onClose={() => setCustomMenuDishes(null)} wide hideHeader>
          <PackageBuilder
            venueId={venueId}
            template={{ id: "", venue_id: venueId, name: wizard.customMenu?.name ?? "Сопствено мени", description: null }}
            initialItemIds={wizard.customMenu?.itemIds ?? []}
            items={customMenuDishes}
            allowDelete={false}
            // Kept in the form only: it is created together with the event.
            onSave={async ({ name, itemIds }) => {
              if (itemIds.length === 0) throw new Error("Изберете барем едно јадење.");
              update({ customMenu: { name, itemIds } });
            }}
            onClose={() => setCustomMenuDishes(null)}
            onChanged={() => undefined}
          />
        </Modal>
      ) : null}

      {viewingMenuIndex !== null ? (
        <MenuFlipModal
          templates={menuTemplates}
          openIndex={viewingMenuIndex}
          selectedIds={wizard.menuTemplateIds}
          onNavigate={setViewingMenuIndex}
          onPick={toggleMenu}
          onClose={() => setViewingMenuIndex(null)}
        />
      ) : null}
    </div>
  );
}
