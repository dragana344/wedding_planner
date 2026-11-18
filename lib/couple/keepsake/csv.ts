// The couple's budget as a spreadsheet for the "Табели" download (group A
// task 7). The guest list reuses lib/couple/guest-csv.ts and the seating
// lib/seating/csv.ts; this follows the seating file's shape: `;` (the
// Macedonian Excel list separator), UTF-8 BOM so Cyrillic opens, CRLF rows.
import type { KeepsakeData } from "./types";

const HEADER = ["Категорија", "Ставка", "Планирано (ден)", "Платено (ден)", "Платил", "Датум на плаќање", "Белешка"];

function cell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // A leading = + - @ (or a tab/CR before one) would run as a formula in a spreadsheet.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** "2027-06-12" → "12.06.2027", how Excel in Macedonia reads a date. */
function day(iso: string | null): string | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return match ? `${match[3]}.${match[2]}.${match[1]}` : null;
}

/** The venue's own line (when the venue entered a price or deposit), every item, then the totals. */
export function budgetCsv(budget: KeepsakeData["budget"]): string {
  const rows: (string | number | null)[][] = [];
  if (budget.venue.estimated !== null || budget.venue.paid !== null) {
    rows.push(["Локал", "Локал", budget.venue.estimated, budget.venue.paid ?? 0, null, null, null]);
  }
  for (const item of budget.items) {
    rows.push([item.category, item.name, item.estimated, item.paid, item.paidBy, day(item.paymentDate), item.notes]);
  }
  rows.push(["Вкупно", null, budget.totalEstimated, budget.totalPaid, null, null, null]);
  return "﻿" + [HEADER, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
