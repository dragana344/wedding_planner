// Guest list CSV export and import (A20). Pure, so it is unit-tested without a
// database and runs on either side.
import type { Guest, GuestSide } from "@/lib/couple/guests";
import { MENU_LABELS, SIDE_LABELS, STATUS_LABELS } from "@/lib/couple/guest-labels";

export const GUEST_IMPORT_MAX_ROWS = 1000;
const PARTY_SIZE_MAX = 50;

export interface GuestImportRow {
  full_name: string;
  phone: string | null;
  email: string | null;
  side: GuestSide | null;
  party_size: number;
}

export interface GuestImportError {
  /** 1-based line in the file (the header is line 1). */
  line: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Export

const EXPORT_HEADER = ["Име и презиме", "Телефон", "Email", "Страна", "Лица", "Деца", "Статус", "Мени", "Алергии", "Коментар", "Покана испратена"];

/** A spreadsheet runs a cell starting with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // Guests type some of these fields themselves (CSV/formula injection).
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV for Excel/Sheets: UTF-8 with BOM (Cyrillic), CRLF. Never includes the invite token. */
export function guestsToCsv(guests: readonly Guest[]): string {
  const lines = guests.map((g) =>
    [
      g.full_name,
      g.phone,
      g.email,
      g.side ? SIDE_LABELS[g.side] : null,
      g.party_size,
      g.children_count,
      STATUS_LABELS[g.rsvp_status] ?? g.rsvp_status,
      g.menu_choice ? MENU_LABELS[g.menu_choice] : null,
      g.allergies,
      g.rsvp_comment,
      g.invitation_sent_at ? `Да${g.invitation_channel ? ` (${g.invitation_channel})` : ""}` : "Не",
    ]
      .map(cell)
      .join(","),
  );
  return "﻿" + [EXPORT_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Import

/** RFC 4180 records with the given delimiter (quotes may span lines). */
function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

type Column = keyof GuestImportRow;

const HEADER_ALIASES: Record<string, Column> = {
  "име и презиме": "full_name",
  "име": "full_name",
  "гостин": "full_name",
  name: "full_name",
  "full name": "full_name",
  full_name: "full_name",
  "телефон": "phone",
  phone: "phone",
  email: "email",
  "е-пошта": "email",
  "емаил": "email",
  "страна": "side",
  side: "side",
  "лица": "party_size",
  "број на лица": "party_size",
  party_size: "party_size",
  "party size": "party_size",
  guests: "party_size",
};

const SIDE_VALUES: Record<string, GuestSide> = {
  "невеста": "bride",
  "невестата": "bride",
  "страна на невестата": "bride",
  bride: "bride",
  "младоженец": "groom",
  "младоженецот": "groom",
  "страна на младоженецот": "groom",
  groom: "groom",
};

/** Undo the export's formula guard ("'=x" -> "=x"); the database stores text only. */
function unguard(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

/**
 * Guests from a CSV the couple uploads: name required; phone, email, side and
 * party size optional, in any order, with Macedonian or English headers and a
 * comma, semicolon or tab delimiter. Bad lines are reported, good ones kept.
 */
export function parseGuestCsv(input: string): { rows: GuestImportRow[]; errors: GuestImportError[] } {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const records = parseRecords(text, delimiter);
  const header = (records[0] ?? []).map((h) => HEADER_ALIASES[h.trim().toLowerCase()]);

  if (!header.includes("full_name")) {
    return { rows: [], errors: [{ line: 1, message: "Недостасува колона „Име и презиме“." }] };
  }
  const body = records.slice(1);
  const nonBlank = body.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonBlank.length > GUEST_IMPORT_MAX_ROWS) {
    return { rows: [], errors: [{ line: 1, message: `Најмногу ${GUEST_IMPORT_MAX_ROWS} гости во една датотека.` }] };
  }

  const rows: GuestImportRow[] = [];
  const errors: GuestImportError[] = [];
  body.forEach((record, index) => {
    if (!record.some((v) => v.trim() !== "")) return;
    const line = index + 2;
    const get = (column: Column) => {
      const at = header.indexOf(column);
      return at === -1 ? "" : unguard((record[at] ?? "").trim());
    };

    const fullName = get("full_name");
    if (!fullName) return void errors.push({ line, message: "Недостасува име." });
    if (fullName.length > 300) return void errors.push({ line, message: "Името е предолго." });

    const sizeText = get("party_size");
    const partySize = sizeText === "" ? 1 : Number(sizeText);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > PARTY_SIZE_MAX) {
      return void errors.push({ line, message: `Бројот на лица мора да е од 1 до ${PARTY_SIZE_MAX}.` });
    }

    const email = get("email");
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return void errors.push({ line, message: "Неважечки email." });
    }

    const sideText = get("side").toLowerCase();
    const side = sideText ? SIDE_VALUES[sideText] : null;
    if (side === undefined) return void errors.push({ line, message: "Страната мора да е „невеста“ или „младоженец“." });

    const phone = get("phone");
    if (phone.length > 50) return void errors.push({ line, message: "Телефонот е предолг." });

    rows.push({ full_name: fullName, phone: phone || null, email: email || null, side, party_size: partySize });
  });
  return { rows, errors };
}
