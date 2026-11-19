"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Invitee, RsvpAnswer } from "@/lib/couple/rsvp";
import type { InvitationGreetingState } from "@/lib/couple/invite-greetings";
import { postJson } from "@/components/album/media-client";
import { checkPartyNumbers } from "@/lib/couple/rsvp-answer-view";
import { isGuestDone, NO_MEAL_OVER_CHILDREN_ERROR } from "@/lib/couple/guest-menus";
import {
  RSVP_DEADLINE_PASSED_ERROR,
  RSVP_EVENT_CANCELLED_MESSAGE,
  RSVP_EVENT_PASSED_MESSAGE,
  formatDeadline,
  type InvitationPhase,
} from "@/lib/rsvp-deadline";
import { InvitationGreeting } from "./InvitationGreeting";

const IDENTIFY_FAILED = "Нешто тргна наопаку. Обидете се повторно.";

const ANSWERS: { value: RsvpAnswer; label: string }[] = [
  { value: "confirmed", label: "Ќе присуствувам" },
  { value: "declined", label: "Нема да присуствувам" },
  { value: "later", label: "Ќе одговорам подоцна" },
];

const THANKS: Record<RsvpAnswer, string> = {
  confirmed: "Ви благодариме! Го забележавме вашето доаѓање.",
  declined: "Ви благодариме што нè известивте.",
  later: "Во ред — можете да одговорите подоцна преку истиот линк.",
};

function isAnswer(status: string | undefined): status is RsvpAnswer {
  return status === "confirmed" || status === "declined" || status === "later";
}

/** "3 лица (од кои 1 дете) · Месо: 2, Посно: 1", for a guest's earlier yes. */
function partySummary(partySize: number, childrenCount: number, menuParts: string[]): string {
  const people = partySize === 1 ? "1 лице" : `${partySize} лица`;
  const children = childrenCount > 0 ? ` (од кои ${childrenCount} ${childrenCount === 1 ? "дете" : "деца"})` : "";
  return `${people}${children}${menuParts.length > 0 ? ` · ${menuParts.join(", ")}` : ""}`;
}

/** "Месо: 2", "Посно: 1", "без оброк: 1" for the summary of a yes. */
function menuSummaryParts(menus: { id: string; name: string }[], counts: Record<string, number>, noMeal: number): string[] {
  const parts = menus.filter((m) => counts[m.id]).map((m) => `${m.name}: ${counts[m.id]}`);
  return noMeal > 0 ? [...parts, `без оброк: ${noMeal}`] : parts;
}

/** Party size limit (the database's own check); there is no smaller cap for guests. */
const PARTY_MAX = 100;

/**
 * 0179: the shared link remembers who answered on this device (a signed
 * token from the server, plus the name they typed), so a later visit
 * updates the same guest. Storage can be off or full: then it just forgets.
 */
type Remembered = { token: string; name: string };
const rememberKey = (slug: string) => `rsvp-remember:${slug}`;

function loadRemembered(slug: string): Remembered | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(rememberKey(slug)) ?? "null") as Partial<Remembered> | null;
    return parsed && typeof parsed.token === "string" && typeof parsed.name === "string" && parsed.name ? { token: parsed.token, name: parsed.name } : null;
  } catch {
    return null;
  }
}

function saveRemembered(slug: string, value: Remembered | null): void {
  try {
    if (value) window.localStorage.setItem(rememberKey(slug), JSON.stringify(value));
    else window.localStorage.removeItem(rememberKey(slug));
  } catch {
    // Private mode or storage off: nothing to remember with.
  }
}

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-[16px]";
const labelClass = "mb-1 block text-sm text-neutral-600";

export function RsvpForm({
  slug,
  accentColor,
  coupleNames,
  venueName,
  invitee,
  guestToken,
  menus = [],
  titleClassName = "font-display text-lg",
  greeting = null,
  phase = "open",
  deadline = null,
  postponedTo = null,
  reconfirm = false,
  onSaved,
}: {
  slug: string;
  accentColor: string;
  coupleNames?: string;
  venueName?: string;
  /** Set on a personal link (A1): the guest is known, so no name is asked. */
  invitee?: Invitee | null;
  guestToken?: string;
  /** The event's menus; the question is asked only with two or more. */
  menus?: { id: string; name: string }[];
  /** The invitation template's display face for the card title. */
  titleClassName?: string;
  /** 0151: a greeting is offered once the guest has answered; null when the package has none. */
  greeting?: InvitationGreetingState | null;
  /** 0180: whether guests can answer today (the server refuses outside "open" too). */
  phase?: InvitationPhase;
  /** 0180: the venue's deadline, "YYYY-MM-DD" (the day itself is still open). */
  deadline?: string | null;
  /** 0180: the event's new date, when it moved after guests had answered. */
  postponedTo?: string | null;
  /** 0180: this personal-link guest said yes before the date moved: offer a one-tap confirmation. */
  reconfirm?: boolean;
  /** Called with the answer once it is saved, so the page can update around the form. */
  onSaved?: (status: RsvpAnswer) => void;
}) {
  const personal = Boolean(invitee && guestToken);
  const initialStatus = isAnswer(invitee?.rsvpStatus) ? invitee.rsvpStatus : null;
  // 0180: a yes whose menus no longer add up (a second menu was added after
  // they answered) — the form opens on the menu question.
  const needsMenu =
    personal &&
    phase === "open" &&
    initialStatus === "confirmed" &&
    menus.length >= 2 &&
    !isGuestDone(
      { rsvp_status: "confirmed", party_size: invitee!.partySize, menu_counts: invitee!.menuCounts, no_meal_count: invitee!.noMealCount ?? 0 },
      menus.map((m) => m.id),
    );
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<RsvpAnswer | null>(initialStatus);
  const [partySize, setPartySize] = useState(String(invitee?.partySize ?? 1));
  const [childrenCount, setChildrenCount] = useState(String(invitee?.childrenCount ?? 0));
  // 0181: children who eat no adult menu ("дете / без оброк").
  const [noMealCount, setNoMealCount] = useState(String(invitee?.noMealCount ?? 0));
  const [savedNoMeal, setSavedNoMeal] = useState(invitee?.noMealCount ?? 0);
  const chooseMenu = menus.length >= 2;
  // Asked only with children and at least one menu to skip.
  const offerNoMeal = menus.length >= 1 && (Number(childrenCount) || 0) > 0;
  const noMeal = offerNoMeal ? Math.max(0, Math.floor(Number(noMealCount) || 0)) : 0;
  const countsOf = (counts: Record<string, number> | undefined) => Object.fromEntries(menus.map((m) => [m.id, String(counts?.[m.id] ?? 0)]));
  const [menuInputs, setMenuInputs] = useState<Record<string, string>>(() => countsOf(invitee?.menuCounts));
  // Menu counts on record, shown in the summary after sending.
  const [savedMenuCounts, setSavedMenuCounts] = useState<Record<string, number>>(invitee?.menuCounts ?? {});
  const [allergies, setAllergies] = useState(invitee?.allergies ?? "");
  const [comment, setComment] = useState(invitee?.rsvpComment ?? "");
  // 0179: the names of the people coming with the guest (optional), and the
  // shared link's optional phone and remembered guest.
  const [household, setHousehold] = useState<string[]>(invitee?.householdNames ?? []);
  const [phone, setPhone] = useState("");
  const [remembered, setRemembered] = useState<Remembered | null>(null);
  useEffect(() => {
    // After mount: the server render has no storage to read.
    if (!personal) setRemembered(loadRemembered(slug));
  }, [personal, slug]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The answer on record: shown as a summary until the guest asks to change it (A2).
  const [savedStatus, setSavedStatus] = useState<RsvpAnswer | null>(initialStatus);
  const [justSent, setJustSent] = useState(false);
  const [editing, setEditing] = useState(!initialStatus || needsMenu);
  const [reconfirmed, setReconfirmed] = useState(false);
  // Who a greeting is from, set by the RSVP response (on the shared link the
  // only way to know), and whether that guest already sent one.
  const [greetingTicket, setGreetingTicket] = useState<{ ticket: string; sent: boolean } | null>(null);
  // 0152: the shared link's way to unlock the greeting box before answering
  // — typing just a name, instead of the full RSVP, gets the same kind of ticket.
  const [identifyName, setIdentifyName] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [identifyTicket, setIdentifyTicket] = useState<{ ticket: string; sent: boolean } | null>(null);

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault();
    const name = remembered ? remembered.name : identifyName.trim();
    if (!name) return;
    setIdentifying(true);
    setIdentifyError(null);
    try {
      const payload = remembered ? { full_name: name, remember: remembered.token } : { full_name: name };
      setIdentifyTicket(await postJson<{ ticket: string; sent: boolean }>(`/api/invite/${slug}/greetings/identify`, payload, IDENTIFY_FAILED));
    } catch (err) {
      setIdentifyError((err as Error).message || IDENTIFY_FAILED);
    } finally {
      setIdentifying(false);
    }
  }

  // Before answering: a personal link already knows the guest; the shared
  // link needs the mini name form above first. After answering, the
  // (!editing && savedStatus) branch below has its own version of this,
  // fed by the RSVP response's ticket instead.
  const greetingWithoutAnswer =
    greeting?.enabled ? (
      personal ? (
        <InvitationGreeting
          slug={slug}
          accentColor={accentColor}
          coupleNames={coupleNames}
          sender={{ guest_token: guestToken! }}
          videoSeconds={greeting.videoSeconds}
          alreadySent={greeting.sent}
        />
      ) : identifyTicket ? (
        <InvitationGreeting
          key={identifyTicket.ticket}
          slug={slug}
          accentColor={accentColor}
          coupleNames={coupleNames}
          sender={{ ticket: identifyTicket.ticket }}
          videoSeconds={greeting.videoSeconds}
          alreadySent={identifyTicket.sent}
        />
      ) : (
        <form onSubmit={handleIdentify} className="mt-6 space-y-3 border-t pt-5 text-left" style={{ borderColor: accentColor }}>
          <div className="text-center">
            <p className="font-medium text-neutral-800">Сакате да испратите честитка пред да одговорите?</p>
            {remembered ? null : <p className="mt-1 text-sm text-neutral-600">Внесете го вашето име:</p>}
          </div>
          {remembered ? null : (
            <input
              value={identifyName}
              onChange={(e) => setIdentifyName(e.target.value)}
              placeholder="Вашето име"
              aria-label="Вашето име"
              className={inputClass}
            />
          )}
          {identifyError ? (
            <p className="text-sm text-red-700" role="alert">
              {identifyError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={identifying || (!remembered && !identifyName.trim())}
            className="min-h-11 w-full rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: accentColor, color: accentColor }}
          >
            {identifying ? "…" : "Продолжи"}
          </button>
        </form>
      )
    ) : null;
  const preAnswerGreeting = editing ? greetingWithoutAnswer : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit(status);
  }

  /** Sends an answer; true once it is saved. */
  async function submit(status: RsvpAnswer | null): Promise<boolean> {
    if (status === null) {
      setError("Изберете дали ќе присуствувате.");
      return false;
    }
    if (status === "confirmed") {
      const numbersError = checkPartyNumbers(Number(partySize) || 1, Number(childrenCount) || 0);
      if (numbersError) {
        setError(numbersError);
        return false;
      }
      if (noMeal > (Number(childrenCount) || 0)) {
        setError(NO_MEAL_OVER_CHILDREN_ERROR);
        return false;
      }
    }
    const menuCounts: Record<string, number> = {};
    if (status === "confirmed" && chooseMenu) {
      let total = 0;
      for (const m of menus) {
        const n = Math.max(0, Math.floor(Number(menuInputs[m.id]) || 0));
        total += n;
        if (n > 0) menuCounts[m.id] = n;
      }
      const size = Number(partySize) || 1;
      if (total + noMeal !== size) {
        setError(`Изберете мени за сите ${Math.max(0, size - noMeal)} лица.`);
        return false;
      }
    }
    setError(null);
    setIsSubmitting(true);
    // A remembered guest answers under the name they first typed; the token
    // tells the server which guest that was.
    const typedName = remembered ? remembered.name : fullName.trim();
    const who = personal
      ? { guest_token: guestToken }
      : {
          full_name: remembered ? remembered.name : fullName,
          ...(remembered ? { remember: remembered.token } : {}),
          ...(!remembered && phone.trim() ? { phone: phone.trim() } : {}),
        };
    const note = comment.trim() || null;
    const names = household.slice(0, Math.max(0, (Number(partySize) || 1) - 1)).map((n) => n.trim()).filter(Boolean);
    const body =
      status === "confirmed"
        ? {
            ...who,
            status,
            party_size: Number(partySize) || 1,
            children_count: Number(childrenCount) || 0,
            ...(chooseMenu ? { menu_counts: menuCounts } : {}),
            ...(offerNoMeal ? { no_meal_count: noMeal } : {}),
            allergies: allergies.trim() || null,
            comment: note,
            ...(names.length > 0 ? { household_names: names } : {}),
          }
        : { ...who, status, comment: note };
    try {
      const response = await fetch(`/api/invite/${slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const { error: message } = await response.json();
        setError(message ?? "Нешто тргна наопаку. Обидете се повторно.");
        return false;
      }
      const saved = (await response.json().catch(() => ({}))) as { greeting?: { ticket: string; sent: boolean }; remember?: string };
      setGreetingTicket(saved.greeting ?? null);
      if (!personal && saved.remember) {
        const next = { token: saved.remember, name: typedName };
        saveRemembered(slug, next);
        setRemembered(next);
      }
      setSavedStatus(status);
      setSavedMenuCounts(menuCounts);
      setSavedNoMeal(status === "confirmed" && offerNoMeal ? noMeal : 0);
      setJustSent(true);
      setEditing(false);
      onSaved?.(status);
      return true;
    } catch {
      setError("Нешто тргна наопаку. Обидете се повторно.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = (
    <p className={`text-center ${titleClassName}`} style={{ color: accentColor, fontSize: 28, margin: 0 }}>
      Потврда за доаѓање
    </p>
  );

  // 0180: after the event, or a cancelled one — no form at all.
  if (phase === "after" || phase === "cancelled") {
    return (
      <div className="mt-8 text-center">
        <p className="font-medium text-neutral-800" role="status">
          {phase === "after" ? RSVP_EVENT_PASSED_MESSAGE : RSVP_EVENT_CANCELLED_MESSAGE}
        </p>
      </div>
    );
  }

  const deadlineLine =
    deadline && phase === "open" ? <p className="mt-2 text-center text-sm text-neutral-600">Ве молиме одговорете до {formatDeadline(deadline)}</p> : null;
  const postponedBanner = postponedTo ? (
    <p role="status" className="mt-4 rounded-lg border px-3 py-2 text-center text-sm font-medium" style={{ borderColor: accentColor, color: accentColor }}>
      Датумот е променет на {formatDeadline(postponedTo)} — потврдете дали доаѓате
    </p>
  ) : null;

  // 0180: past the venue's deadline. A personal link still shows the answer
  // on record, and greetings stay open.
  if (phase === "closed") {
    const closedSummary =
      personal && savedStatus
        ? savedStatus === "confirmed"
          ? `Ќе присуствувате · ${partySummary(invitee!.partySize, invitee!.childrenCount, menuSummaryParts(menus, savedMenuCounts, savedNoMeal))}`
          : savedStatus === "declined"
            ? "Нема да присуствувате"
            : "Ќе одговорите подоцна"
        : null;
    return (
      <div className="mt-8 text-center">
        {title}
        {closedSummary ? <p className="mt-3 font-medium text-neutral-800">Вашиот одговор: {closedSummary}</p> : null}
        <p className="mt-3 text-neutral-800" role="status">
          {RSVP_DEADLINE_PASSED_ERROR}
        </p>
        {greetingWithoutAnswer}
      </div>
    );
  }

  if (!editing && savedStatus) {
    const menuParts = menuSummaryParts(menus, savedMenuCounts, savedNoMeal);
    const summary =
      savedStatus === "confirmed"
        ? `Ќе присуствувате · ${partySummary(Number(partySize) || 1, Number(childrenCount) || 0, menuParts)}`
        : savedStatus === "declined"
          ? "Нема да присуствувате"
          : "Ќе одговорите подоцна";
    // A personal link names the guest even before this visit's answer; the
    // shared link only after it, through the RSVP's ticket.
    const greetingSender = personal ? { guest_token: guestToken! } : greetingTicket ? { ticket: greetingTicket.ticket } : null;
    const greetingBlock =
      greeting && greetingSender ? (
        <InvitationGreeting
          key={greetingTicket?.ticket ?? "personal"}
          slug={slug}
          accentColor={accentColor}
          coupleNames={coupleNames}
          sender={greetingSender}
          videoSeconds={greeting.videoSeconds}
          alreadySent={greetingTicket?.sent ?? greeting.sent}
        />
      ) : null;
    return (
      <div className="mt-8 rounded-2xl border p-6 text-center" style={{ borderColor: accentColor }}>
        {postponedTo && !justSent ? postponedBanner : null}
        {justSent ? <p className="font-medium text-neutral-800">{THANKS[savedStatus]}</p> : null}
        {personal ? (
          <>
            <p className={justSent ? "mt-3 text-sm text-neutral-600" : "font-medium text-neutral-800"}>Вашиот одговор: {summary}</p>
            {deadlineLine}
            {reconfirm && savedStatus === "confirmed" && !reconfirmed && !justSent ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  if (await submit("confirmed")) setReconfirmed(true);
                }}
                className="mt-4 block min-h-11 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: accentColor }}
              >
                {isSubmitting ? "Се испраќа…" : "Потврдувам — доаѓам"}
              </button>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setJustSent(false);
                setEditing(true);
              }}
              className="mt-4 min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: accentColor, color: accentColor }}
            >
              Промени го одговорот
            </button>
          </>
        ) : (
          // The shared link is often opened by one person for the family:
          // give them the empty form back for the next name.
          <button
            type="button"
            onClick={() => {
              setJustSent(false);
              setSavedStatus(null);
              setFullName("");
              setStatus(null);
              setPartySize("1");
              setChildrenCount("0");
              setMenuInputs(countsOf(undefined));
              setSavedMenuCounts({});
              setAllergies("");
              setComment("");
              setHousehold([]);
              setPhone("");
              setRemembered(null);
              setGreetingTicket(null);
              setEditing(true);
            }}
            className="mt-4 min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: accentColor, color: accentColor }}
          >
            Одговори за друго лице
          </button>
        )}
        {greetingBlock}
      </div>
    );
  }

  return (
    <>
    <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
      <div>
        {title}
        {deadlineLine}
        {postponedBanner}
      </div>

      {needsMenu ? (
        <div role="status" className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: accentColor }}>
          <p className="font-semibold" style={{ color: accentColor }}>
            Изберете мени
          </p>
          <p className="mt-1 text-sm text-neutral-700">Сега има повеќе менија. Изберете кое мени ќе го јаде секое лице од вашето друштво.</p>
        </div>
      ) : null}

      {personal ? null : remembered ? (
        <div className="text-center">
          <p className="font-medium text-neutral-800">Здраво, {remembered.name}!</p>
          <button
            type="button"
            onClick={() => {
              saveRemembered(slug, null);
              setRemembered(null);
              setFullName("");
            }}
            className="mt-1 text-sm underline"
            style={{ color: accentColor }}
          >
            Не сте вие? Одговорете за друго лице
          </button>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="rsvp-name" className={labelClass}>
              Име и презиме
            </label>
            <input
              id="rsvp-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="rsvp-phone" className={labelClass}>
              Телефон (по желба — за полесно да ве најдат младенците)
            </label>
            <input
              id="rsvp-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              maxLength={50}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className={inputClass}
            />
          </div>
        </>
      )}

      <div>
        <p className={labelClass}>Дали ќе присуствувате?</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {ANSWERS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setStatus(a.value)}
              aria-pressed={status === a.value}
              className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium"
              style={
                status === a.value
                  ? { background: accentColor, borderColor: accentColor, color: "#fff" }
                  : { borderColor: "#d4d4d8", color: "#3f3f46" }
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {status === "confirmed" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rsvp-party-size" className={labelClass}>
                Број на лица (со вас)
              </label>
              <input
                id="rsvp-party-size"
                type="number"
                inputMode="numeric"
                min={1}
                max={PARTY_MAX}
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="rsvp-children" className={labelClass}>
                од кои деца
              </label>
              <input
                id="rsvp-children"
                type="number"
                inputMode="numeric"
                min={0}
                max={PARTY_MAX}
                value={childrenCount}
                onChange={(e) => setChildrenCount(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {offerNoMeal ? (
            <div>
              <label htmlFor="rsvp-no-meal" className={labelClass}>
                Деца без оброк (не јадат од менито)
              </label>
              <input
                id="rsvp-no-meal"
                type="number"
                inputMode="numeric"
                min={0}
                max={PARTY_MAX}
                value={noMealCount}
                onChange={(e) => setNoMealCount(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}

          {(Number(partySize) || 1) > 1 ? (
            <fieldset>
              <legend className={labelClass}>Имиња на лицата што доаѓаат со вас (не е задолжително)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: Math.min(PARTY_MAX, Number(partySize) || 1) - 1 }, (_, i) => (
                  <input
                    key={i}
                    aria-label={`Лице ${i + 2}`}
                    placeholder={`Лице ${i + 2}`}
                    value={household[i] ?? ""}
                    maxLength={200}
                    onChange={(e) =>
                      setHousehold((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    className={inputClass}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}

          {chooseMenu ? (
            <fieldset>
              <legend className={labelClass}>Мени (колку лица кое мени јадат)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {menus.map((m) => (
                  <div key={m.id}>
                    <label htmlFor={`rsvp-menu-${m.id}`} className={labelClass}>
                      {m.name}
                    </label>
                    <input
                      id={`rsvp-menu-${m.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={menuInputs[m.id] ?? "0"}
                      onChange={(e) => setMenuInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div>
            <label htmlFor="rsvp-allergies" className={labelClass}>
              Алергии или посебни барања за храна (по желба)
            </label>
            <input
              id="rsvp-allergies"
              value={allergies}
              maxLength={300}
              onChange={(e) => setAllergies(e.target.value)}
              className={inputClass}
            />
          </div>
        </>
      ) : null}

      <div>
        <label htmlFor="rsvp-comment" className={labelClass}>
          Порака до младенците (по желба)
        </label>
        <textarea
          id="rsvp-comment"
          value={comment}
          maxLength={500}
          rows={3}
          onChange={(e) => setComment(e.target.value)}
          className={inputClass}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {/* COMP-001 / R1-03: information at the point of collection (Art. 13). */}
      <p className="text-xs leading-relaxed text-neutral-500">
        Вашиот одговор (име, телефон, доаѓање, број на лица и нивните имиња, мени, алергии, порака) и секоја негова промена ги гледаат{" "}
        {coupleNames || "домаќините на настанот"} и локалот, за да го подготват настанот. Одговорен за податоците е{" "}
        {venueName ? `локалот ${venueName}` : "локалот"}, кој може да ги извезе или избрише; платформата Каде си? ги обработува во
        негово име. Повеќе во{" "}
        <Link href="/privacy" target="_blank" className="underline">
          Политиката за приватност
        </Link>
        .
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-12 w-full rounded-lg px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
        style={{ background: accentColor }}
      >
        {isSubmitting ? "Се испраќа…" : "Испрати одговор"}
      </button>
    </form>
    {preAnswerGreeting}
    </>
  );
}
