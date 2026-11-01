import { VENUE_TIME_ZONE } from "@/lib/date";
import { formatDen } from "@/lib/money";
import type { EventChange } from "./types";

// Human-readable one-liners for the change log. Values are jsonb written by
// the recorders in 0125; any of them can be missing (personal-data erasure
// nulls contact values), so every read is defensive.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function date(v: unknown): string {
  const s = str(v);
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}

function time(v: unknown): string | null {
  const s = str(v);
  return s ? s.slice(0, 5) : null;
}

function dateTime(v: unknown): string {
  const o = obj(v);
  const start = time(o.start);
  const end = time(o.end);
  const range = start && end ? `${start}–${end}` : (start ?? end);
  return range ? `${date(o.date)} ${range}` : date(o.date);
}

function money(v: unknown): string {
  return typeof v === "number" ? formatDen(v) : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? formatDen(Number(v)) : "—";
}

function dishes(v: unknown): string {
  const d = obj(v).dishes;
  return Array.isArray(d) && d.length > 0 ? d.join(", ") : "—";
}

function describeContact(c: EventChange): string {
  const before = obj(c.oldValue);
  const after = obj(c.newValue);
  const fields: [string, string][] = [["email", "Е-пошта"], ["email_2", "Втора е-пошта"], ["phone", "Телефон"]];
  const parts = fields
    .filter(([k]) => (str(before[k]) ?? "") !== (str(after[k]) ?? ""))
    .map(([k, label]) => `${label}: ${str(before[k]) ?? "—"} → ${str(after[k]) ?? "—"}`);
  return parts.length > 0 ? parts.join("; ") : "Контакт е променет";
}

function describeFinance(c: EventChange): string {
  const before = obj(c.oldValue);
  const after = obj(c.newValue);
  const fields: [string, string][] = [["total", "Цена"], ["deposit", "Платен капар"]];
  const parts = fields
    .filter(([k]) => money(before[k]) !== money(after[k]))
    .map(([k, label]) => `${label}: ${money(before[k])} → ${money(after[k])}`);
  return parts.length > 0 ? parts.join("; ") : "Финансиите се променети";
}

/** One line for a change. Contact and finance values are hidden when `redactPrivate` (staff without manager elevation). */
export function describeChange(change: EventChange, opts: { redactPrivate: boolean }): string {
  switch (change.section) {
    case "date_time":
      return `${dateTime(change.oldValue)} → ${dateTime(change.newValue)}`;
    case "guest_count": {
      const count = (v: unknown) => (typeof obj(v).count === "number" ? String(obj(v).count) : "—");
      return `${count(change.oldValue)} → ${count(change.newValue)}`;
    }
    case "rooms": {
      const added = change.field === "added";
      const name = str(obj(added ? change.newValue : change.oldValue).name);
      if (name) return `${added ? "Додадена" : "Отстранета"}: ${name}`;
      return added ? "Додадена сала" : "Отстранета сала";
    }
    case "menus": {
      if (change.field === "renamed") return `Ново име: ${str(obj(change.oldValue).name) ?? "—"} → ${str(obj(change.newValue).name) ?? "—"}`;
      if (change.field === "dishes") return `Јадења: ${dishes(change.oldValue)} → ${dishes(change.newValue)}`;
      const added = change.field === "added";
      const name = str(obj(added ? change.newValue : change.oldValue).name);
      if (name) return `${added ? "Додадено" : "Отстрането"}: ${name}`;
      return added ? "Додадено мени" : "Отстрането мени";
    }
    case "contact":
      return opts.redactPrivate ? "Контакт е променет" : describeContact(change);
    case "finance":
      return opts.redactPrivate ? "Финансиите се променети" : describeFinance(change);
  }
}

/** "31.10.2026 14:05" in the venue's time zone (built from parts: Node and browsers print mk-MK differently). */
export function formatChangedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VENUE_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}.${part("year")} ${part("hour")}:${part("minute")}`;
}
