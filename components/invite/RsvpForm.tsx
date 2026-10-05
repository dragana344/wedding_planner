"use client";

import Link from "next/link";
import { useState } from "react";
import type { Invitee, MenuChoice, RsvpAnswer } from "@/lib/couple/rsvp";

const ANSWERS: { value: RsvpAnswer; label: string }[] = [
  { value: "confirmed", label: "Ќе присуствувам" },
  { value: "declined", label: "Нема да присуствувам" },
  { value: "later", label: "Ќе одговорам подоцна" },
];

const MENUS: { value: MenuChoice; label: string }[] = [
  { value: "standard", label: "Стандардно" },
  { value: "posno", label: "Посно" },
  { value: "vegetarian", label: "Вегетаријанско" },
];

const THANKS: Record<RsvpAnswer, string> = {
  confirmed: "Ви благодариме! Го забележавме вашето доаѓање.",
  declined: "Ви благодариме што нè известивте.",
  later: "Во ред — можете да одговорите подоцна преку истиот линк.",
};

function isAnswer(status: string | undefined): status is RsvpAnswer {
  return status === "confirmed" || status === "declined" || status === "later";
}

/** "3 лица (од кои 1 дете) · Посно мени", for a guest's earlier yes. */
function partySummary(partySize: number, childrenCount: number, menuChoice: string | null): string {
  const people = partySize === 1 ? "1 лице" : `${partySize} лица`;
  const children = childrenCount > 0 ? ` (од кои ${childrenCount} ${childrenCount === 1 ? "дете" : "деца"})` : "";
  const menu = MENUS.find((m) => m.value === menuChoice);
  return `${people}${children}${menu ? ` · ${menu.label} мени` : ""}`;
}

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base";
const labelClass = "mb-1 block text-sm text-neutral-600";

export function RsvpForm({
  slug,
  accentColor,
  coupleNames,
  venueName,
  invitee,
  guestToken,
  titleClassName = "font-display text-lg",
}: {
  slug: string;
  accentColor: string;
  coupleNames?: string;
  venueName?: string;
  /** Set on a personal link (A1): the guest is known, so no name is asked. */
  invitee?: Invitee | null;
  guestToken?: string;
  /** The invitation template's display face for the card title. */
  titleClassName?: string;
}) {
  const personal = Boolean(invitee && guestToken);
  const initialStatus = isAnswer(invitee?.rsvpStatus) ? invitee.rsvpStatus : null;
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<RsvpAnswer | null>(initialStatus);
  const [partySize, setPartySize] = useState(String(invitee?.partySize ?? 1));
  const [childrenCount, setChildrenCount] = useState(String(invitee?.childrenCount ?? 0));
  const [menuChoice, setMenuChoice] = useState<MenuChoice | null>((invitee?.menuChoice as MenuChoice | null) ?? null);
  const [allergies, setAllergies] = useState(invitee?.allergies ?? "");
  const [comment, setComment] = useState(invitee?.rsvpComment ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The answer on record: shown as a summary until the guest asks to change it (A2).
  const [savedStatus, setSavedStatus] = useState<RsvpAnswer | null>(initialStatus);
  const [justSent, setJustSent] = useState(false);
  const [editing, setEditing] = useState(!initialStatus);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === null) {
      setError("Изберете дали ќе присуствувате.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const who = personal ? { guest_token: guestToken } : { full_name: fullName };
    const note = comment.trim() || null;
    const body =
      status === "confirmed"
        ? {
            ...who,
            status,
            party_size: Number(partySize) || 1,
            children_count: Number(childrenCount) || 0,
            menu_choice: menuChoice,
            allergies: allergies.trim() || null,
            comment: note,
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
        return;
      }
      setSavedStatus(status);
      setJustSent(true);
      setEditing(false);
    } catch {
      setError("Нешто тргна наопаку. Обидете се повторно.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!editing && savedStatus) {
    const summary =
      savedStatus === "confirmed"
        ? `Ќе присуствувате · ${partySummary(Number(partySize) || 1, Number(childrenCount) || 0, menuChoice)}`
        : savedStatus === "declined"
          ? "Нема да присуствувате"
          : "Ќе одговорите подоцна";
    return (
      <div className="mt-8 rounded-2xl border p-6 text-center" style={{ borderColor: accentColor }}>
        {justSent ? <p className="font-medium text-neutral-800">{THANKS[savedStatus]}</p> : null}
        {personal ? (
          <>
            <p className={justSent ? "mt-3 text-sm text-neutral-600" : "font-medium text-neutral-800"}>Вашиот одговор: {summary}</p>
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
              setMenuChoice(null);
              setAllergies("");
              setComment("");
              setEditing(true);
            }}
            className="mt-4 min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: accentColor, color: accentColor }}
          >
            Одговори за друго лице
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
      <p className={`text-center ${titleClassName}`} style={{ color: accentColor, fontSize: 28, margin: 0 }}>
        Потврда за доаѓање
      </p>

      {personal ? null : (
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
                max={50}
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
                max={20}
                value={childrenCount}
                onChange={(e) => setChildrenCount(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <fieldset>
            <legend className={labelClass}>Мени</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MENUS.map((m) => (
                <label
                  key={m.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="rsvp-menu"
                    value={m.value}
                    checked={menuChoice === m.value}
                    onChange={() => setMenuChoice(m.value)}
                    style={{ accentColor }}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>

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
        Вашиот одговор (име, доаѓање, број на лица, мени, алергии, порака) и секоја негова промена ги гледаат{" "}
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
  );
}
