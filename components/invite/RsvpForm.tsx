"use client";

import Link from "next/link";
import { useState } from "react";
import type { Invitee, RsvpAnswer } from "@/lib/couple/rsvp";
import type { InvitationGreetingState } from "@/lib/couple/invite-greetings";
import { postJson } from "@/components/album/media-client";
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

const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base";
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
}) {
  const personal = Boolean(invitee && guestToken);
  const initialStatus = isAnswer(invitee?.rsvpStatus) ? invitee.rsvpStatus : null;
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<RsvpAnswer | null>(initialStatus);
  const [partySize, setPartySize] = useState(String(invitee?.partySize ?? 1));
  const [childrenCount, setChildrenCount] = useState(String(invitee?.childrenCount ?? 0));
  const chooseMenu = menus.length >= 2;
  const countsOf = (counts: Record<string, number> | undefined) => Object.fromEntries(menus.map((m) => [m.id, String(counts?.[m.id] ?? 0)]));
  const [menuInputs, setMenuInputs] = useState<Record<string, string>>(() => countsOf(invitee?.menuCounts));
  // Menu counts on record, shown in the summary after sending.
  const [savedMenuCounts, setSavedMenuCounts] = useState<Record<string, number>>(invitee?.menuCounts ?? {});
  const [allergies, setAllergies] = useState(invitee?.allergies ?? "");
  const [comment, setComment] = useState(invitee?.rsvpComment ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The answer on record: shown as a summary until the guest asks to change it (A2).
  const [savedStatus, setSavedStatus] = useState<RsvpAnswer | null>(initialStatus);
  const [justSent, setJustSent] = useState(false);
  const [editing, setEditing] = useState(!initialStatus);
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
    const name = identifyName.trim();
    if (!name) return;
    setIdentifying(true);
    setIdentifyError(null);
    try {
      setIdentifyTicket(await postJson<{ ticket: string; sent: boolean }>(`/api/invite/${slug}/greetings/identify`, { full_name: name }, IDENTIFY_FAILED));
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
  const preAnswerGreeting =
    greeting?.enabled && editing ? (
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
            <p className="mt-1 text-sm text-neutral-600">Внесете го вашето име:</p>
          </div>
          <input
            value={identifyName}
            onChange={(e) => setIdentifyName(e.target.value)}
            placeholder="Вашето име"
            aria-label="Вашето име"
            className={inputClass}
          />
          {identifyError ? (
            <p className="text-sm text-red-700" role="alert">
              {identifyError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={identifying || !identifyName.trim()}
            className="min-h-11 w-full rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: accentColor, color: accentColor }}
          >
            {identifying ? "…" : "Продолжи"}
          </button>
        </form>
      )
    ) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === null) {
      setError("Изберете дали ќе присуствувате.");
      return;
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
      if (total !== size) {
        setError(`Изберете мени за сите ${size} лица.`);
        return;
      }
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
            ...(chooseMenu ? { menu_counts: menuCounts } : {}),
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
      const saved = (await response.json().catch(() => ({}))) as { greeting?: { ticket: string; sent: boolean } };
      setGreetingTicket(saved.greeting ?? null);
      setSavedStatus(status);
      setSavedMenuCounts(menuCounts);
      setJustSent(true);
      setEditing(false);
    } catch {
      setError("Нешто тргна наопаку. Обидете се повторно.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!editing && savedStatus) {
    const menuParts = menus.filter((m) => savedMenuCounts[m.id]).map((m) => `${m.name}: ${savedMenuCounts[m.id]}`);
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
              setMenuInputs(countsOf(undefined));
              setSavedMenuCounts({});
              setAllergies("");
              setComment("");
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
    {preAnswerGreeting}
    </>
  );
}
