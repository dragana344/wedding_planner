import { describe, it, expect } from "vitest";
import { seatingCsv } from "@/lib/seating/csv";
import type { RoomSeating } from "@/lib/seating/types";

const data: RoomSeating = {
  tables: [
    { elementId: "t2", label: "Кумови", number: 2, capacity: 4 },
    { elementId: "t1", label: null, number: 1, capacity: 4 },
  ],
  seats: [
    { elementId: "t2", seatNumber: 2, guestId: null, guestName: 'Горан "Кум"; Стојанов', displayName: 'Горан "Кум"; Стојанов' },
    { elementId: "t1", seatNumber: 3, guestId: "g1", guestName: null, displayName: "Ана Петровска" },
    { elementId: "t1", seatNumber: 1, guestId: null, guestName: "Баба Марија", displayName: "Баба Марија" },
  ],
  guests: [],
};

describe("seatingCsv", () => {
  it("starts with a UTF-8 BOM and a header, one row per taken seat, ordered by table then seat", () => {
    const csv = seatingCsv("Голема сала", data);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Сала;Маса;Столче;Гостин",
      "Голема сала;Маса 1;1;Баба Марија",
      "Голема сала;Маса 1;3;Ана Петровска",
      'Голема сала;Кумови;2;"Горан ""Кум""; Стојанов"',
    ]);
  });

  it("gives only the header for an empty room", () => {
    expect(seatingCsv("Сала", { tables: [], seats: [], guests: [] })).toBe("﻿Сала;Маса;Столче;Гостин");
  });

  it("neutralises spreadsheet formulas in names", () => {
    const csv = seatingCsv("Сала", {
      tables: [{ elementId: "t1", label: null, number: 1, capacity: 2 }],
      seats: [{ elementId: "t1", seatNumber: 1, guestId: null, guestName: "=HYPERLINK(1)", displayName: "=HYPERLINK(1)" }],
      guests: [],
    });
    expect(csv.split("\r\n")[1]).toBe("Сала;Маса 1;1;'=HYPERLINK(1)");
  });

  it("also neutralises a leading tab or carriage return", () => {
    const csv = seatingCsv("Сала", {
      tables: [{ elementId: "t1", label: null, number: 1, capacity: 2 }],
      seats: [
        { elementId: "t1", seatNumber: 1, guestId: null, guestName: "\t=1+1", displayName: "\t=1+1" },
        { elementId: "t1", seatNumber: 2, guestId: null, guestName: "\r=1+1", displayName: "\r=1+1" },
      ],
      guests: [],
    });
    const rows = csv.split("\r\n");
    expect(rows[1]).toBe("Сала;Маса 1;1;'\t=1+1");
    expect(rows[2]).toBe('Сала;Маса 1;2;"\'\r=1+1"');
  });
});
