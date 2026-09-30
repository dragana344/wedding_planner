import { tableTitle, type RoomSeating } from "./types";

// Seat lists as CSV for Excel/LibreOffice in Macedonia: `;` separator (the
// local list separator), UTF-8 BOM so Cyrillic opens correctly, CRLF rows.

const HEADER = ["Сала", "Маса", "Столче", "Гостин"];

function cell(value: string): string {
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function seatingCsv(roomName: string, data: RoomSeating): string {
  const tables = [...data.tables].sort((a, b) => a.number - b.number);
  const rows = tables.flatMap((t) =>
    data.seats
      .filter((s) => s.elementId === t.elementId)
      .sort((a, b) => a.seatNumber - b.seatNumber)
      .map((s) => [roomName, tableTitle(t), String(s.seatNumber), s.displayName]),
  );
  return "﻿" + [HEADER, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}
