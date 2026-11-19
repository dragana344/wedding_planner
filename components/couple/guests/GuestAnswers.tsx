"use client";

import { useState } from "react";
import type { Guest } from "@/lib/couple/guests";
import { STATUS_LABELS } from "@/lib/couple/guest-labels";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { formatVenueDateTime } from "@/lib/date";
import { SOURCE_LABELS, checkPartyNumbers, describeChanges, type GuestAnswerHistoryItem } from "@/lib/couple/rsvp-answer-view";
import { NO_MEAL_OVER_CHILDREN_ERROR } from "@/lib/couple/guest-menus";

// 0179, in the guest detail: the couple's "Поканети лица", typing in an
// answer the guest gave by phone (decision 7), and the guest's answer
// history with what each answer changed (decision 8).

type Menu = { id: string; name: string };
type Answer = "confirmed" | "declined" | "later";

const ANSWERS: { value: Answer; label: string }[] = [
  { value: "confirmed", label: STATUS_LABELS.confirmed },
  { value: "declined", label: STATUS_LABELS.declined },
  { value: "later", label: STATUS_LABELS.later },
];

const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14 };

/** "Поканети лица": how many people the couple invited with this guest (empty = not set). */
export function InvitedEditor({ guest, onSaved }: { guest: Guest; onSaved: (guest: Guest) => void }) {
  const [value, setValue] = useState(guest.invited_party_size ? String(guest.invited_party_size) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = guest.invited_party_size ? String(guest.invited_party_size) : "";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const n = value.trim() === "" ? null : Math.floor(Number(value));
      const saved = (await jsonOrThrow(
        await fetch(`/api/couple/guests/${guest.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "invited", invited_party_size: n }),
        }),
      )) as Guest;
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label style={rowStyle}>
        <span>Поканети лица</span>
        <span style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            aria-label="Поканети лица"
            placeholder="—"
            className="fld"
            style={{ width: 80 }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {value !== current ? (
            <button type="button" className="btn" disabled={saving} onClick={() => void save()}>
              Зачувај
            </button>
          ) : null}
        </span>
      </label>
      {error ? (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** "Внеси одговор": the guest's own form, filled in by the couple. */
export function CoupleAnswerForm({ guest, menus, onSaved }: { guest: Guest; menus: Menu[]; onSaved: (guest: Guest) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Answer | null>(null);
  const [partySize, setPartySize] = useState(String(guest.party_size));
  const [children, setChildren] = useState(String(guest.children_count));
  const [noMealInput, setNoMealInput] = useState(String(guest.no_meal_count ?? 0));
  const [menuInputs, setMenuInputs] = useState<Record<string, string>>(() => Object.fromEntries(menus.map((m) => [m.id, String(guest.menu_counts[m.id] ?? 0)])));
  const [allergies, setAllergies] = useState(guest.allergies ?? "");
  const [comment, setComment] = useState("");
  const [household, setHousehold] = useState((guest.household_names ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chooseMenu = menus.length >= 2;
  const offerNoMeal = menus.length >= 1 && (Number(children) || 0) > 0;
  const noMeal = offerNoMeal ? Math.max(0, Math.floor(Number(noMealInput) || 0)) : 0;
  // 0181: a smaller (or bigger) party than the split on record — ask to fix it here.
  const sizeNow = Math.max(1, Math.floor(Number(partySize) || 1));
  const splitNow = menus.reduce((sum, m) => sum + Math.max(0, Math.floor(Number(menuInputs[m.id]) || 0)), 0) + noMeal;
  const fixHint =
    status === "confirmed" && sizeNow !== guest.party_size && ((chooseMenu && splitNow !== sizeNow) || (Number(children) || 0) > sizeNow)
      ? "Бројот на лица се промени — поправете ги децата и менијата погоре."
      : null;

  if (!open) {
    return (
      <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>
        Внеси одговор
      </button>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!status) {
      setError("Изберете одговор.");
      return;
    }
    const size = Math.max(1, Math.floor(Number(partySize) || 1));
    const kids = Math.max(0, Math.floor(Number(children) || 0));
    const counts: Record<string, number> = {};
    if (status === "confirmed") {
      const numbersError = checkPartyNumbers(size, kids);
      if (numbersError) {
        setError(numbersError);
        return;
      }
      if (noMeal > kids) {
        setError(NO_MEAL_OVER_CHILDREN_ERROR);
        return;
      }
      if (chooseMenu) {
        let total = 0;
        for (const m of menus) {
          const n = Math.max(0, Math.floor(Number(menuInputs[m.id]) || 0));
          total += n;
          if (n > 0) counts[m.id] = n;
        }
        if (total + noMeal !== size) {
          setError(`Изберете мени за сите ${Math.max(0, size - noMeal)} лица.`);
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    try {
      const names = household
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const body =
        status === "confirmed"
          ? {
              status,
              party_size: size,
              children_count: kids,
              ...(chooseMenu ? { menu_counts: counts } : {}),
              ...(offerNoMeal ? { no_meal_count: noMeal } : {}),
              allergies: allergies.trim() || null,
              comment: comment.trim() || null,
              household_names: names,
            }
          : { status, comment: comment.trim() || null };
      const saved = (await jsonOrThrow(
        await fetch(`/api/couple/guests/${guest.id}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      )) as Guest;
      setOpen(false);
      setStatus(null);
      setComment("");
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на одговорот.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} style={{ marginTop: 14, display: "grid", gap: 10 }} aria-label="Внеси одговор">
      <h3 style={{ fontSize: 14, margin: "4px 0 0" }}>Внеси одговор</h3>
      <div className="seg gold" role="group" aria-label="Одговор">
        {ANSWERS.map((a) => (
          <button key={a.value} type="button" aria-pressed={status === a.value} onClick={() => setStatus(a.value)}>
            {a.label}
          </button>
        ))}
      </div>
      {status === "confirmed" ? (
        <>
          <label style={rowStyle}>
            <span>Број на лица</span>
            <input type="number" min={1} max={100} inputMode="numeric" className="fld" style={{ width: 90 }} value={partySize} onChange={(e) => setPartySize(e.target.value)} />
          </label>
          <label style={rowStyle}>
            <span>од кои деца</span>
            <input type="number" min={0} max={100} inputMode="numeric" className="fld" style={{ width: 90 }} value={children} onChange={(e) => setChildren(e.target.value)} />
          </label>
          {offerNoMeal ? (
            <label style={rowStyle}>
              <span>Деца без оброк</span>
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                className="fld"
                style={{ width: 90 }}
                value={noMealInput}
                onChange={(e) => setNoMealInput(e.target.value)}
              />
            </label>
          ) : null}
          {chooseMenu
            ? menus.map((m) => (
                <label key={m.id} style={rowStyle}>
                  <span>{m.name}</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Мени ${m.name}`}
                    className="fld"
                    style={{ width: 90 }}
                    value={menuInputs[m.id] ?? "0"}
                    onChange={(e) => setMenuInputs((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  />
                </label>
              ))
            : null}
          <input className="fld" aria-label="Алергии" placeholder="Алергии (по желба)" maxLength={300} value={allergies} onChange={(e) => setAllergies(e.target.value)} />
          <input
            className="fld"
            aria-label="Со кого доаѓа"
            placeholder="Со кого доаѓа (имиња, одделени со запирка)"
            value={household}
            onChange={(e) => setHousehold(e.target.value)}
          />
        </>
      ) : null}
      {fixHint ? (
        <p role="status" style={{ margin: 0, fontSize: 13.5, color: "var(--bad)" }}>
          {fixHint}
        </p>
      ) : null}
      <input className="fld" aria-label="Коментар" placeholder="Коментар (по желба)" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-gold" disabled={saving}>
          {saving ? "Се зачувува..." : "Зачувај одговор"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Откажи
        </button>
      </div>
    </form>
  );
}

/** "Историја на одговори": loaded when opened, newest first, each with what it changed. */
export function AnswerHistory({ guestId, menus }: { guestId: string; menus: Menu[] }) {
  const [items, setItems] = useState<GuestAnswerHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await jsonOrThrow(await fetch(`/api/couple/guests/${guestId}/answers`));
      setItems(data.history as GuestAnswerHistoryItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа вчитувањето на историјата.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, margin: "18px 0 8px" }}>Историја на одговори</h3>
      {items === null ? (
        <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => void load()}>
          {loading ? "Се вчитува…" : "Прикажи"}
        </button>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>Сè уште нема одговори.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {items.map((h) => {
            const changes = describeChanges(h.before, h.after, menus);
            return (
              <li key={h.id} style={{ fontSize: 13.5 }}>
                <span style={{ color: "var(--muted)" }}>
                  {formatVenueDateTime(h.createdAt, { time: true })} · {SOURCE_LABELS[h.source]}
                </span>
                <br />
                {h.linked ? "Само поврзано — бројките не се сменети" : changes.length > 0 ? changes.join(" · ") : "Без промена"}
                {h.comment ? <span style={{ color: "var(--muted)" }}>{` · „${h.comment}“`}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
