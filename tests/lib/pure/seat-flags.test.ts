import { describe, it, expect } from "vitest";
import { seatFlags, seatFlagsSummary } from "@/lib/seating/flags";
import type { Seat, SeatTable } from "@/lib/seating/types";

// 0181: seated guests who declined or hold more seats than their party.

const tables: SeatTable[] = [
  { elementId: "t5", label: null, number: 5, capacity: 10 },
  { elementId: "t2", label: "Главна маса", number: 2, capacity: 8 },
];

function seat(elementId: string, seatNumber: number, guestId: string | null): Seat {
  return { elementId, seatNumber, guestId, guestName: guestId ? null : "Гостин", displayName: guestId ?? "Гостин" };
}

describe("seatFlags", () => {
  it("flags a declined guest and a party smaller than its seats, with the tables in this room, by name", () => {
    const seats = [seat("t5", 1, "g1"), seat("t5", 2, "g1"), seat("t5", 3, "g2"), seat("t5", 4, "g2"), seat("t2", 1, "g2"), seat("t2", 2, "g3")];
    const flags = seatFlags(
      [
        { id: "g1", fullName: "Марко", rsvpStatus: "declined", partySize: 2, seatsTaken: 2 },
        { id: "g2", fullName: "Ана", rsvpStatus: "confirmed", partySize: 1, seatsTaken: 4 },
        { id: "g3", fullName: "Ива", rsvpStatus: "confirmed", partySize: 1, seatsTaken: 1 },
        { id: "g4", fullName: "Петар", rsvpStatus: "declined", partySize: 1, seatsTaken: 0 },
      ],
      seats,
      tables,
    );
    expect(flags).toEqual([
      { guestId: "g2", fullName: "Ана", kind: "over", extra: 3, text: "3 места повеќе на Главна маса, маса 5" },
      { guestId: "g1", fullName: "Марко", kind: "declined", extra: 2, text: "Одбил — ослободете ги местата на маса 5" },
    ]);
  });

  it("names no table for a guest seated only in another room", () => {
    const flags = seatFlags([{ id: "g1", fullName: "Марко", rsvpStatus: "confirmed", partySize: 1, seatsTaken: 2 }], [], tables);
    expect(flags[0].text).toBe("1 место повеќе");
  });

  it("summarises the count", () => {
    expect(seatFlagsSummary(1)).toBe("1 гостин на распоредот треба да се провери");
    expect(seatFlagsSummary(4)).toBe("4 гости на распоредот треба да се проверат");
  });
});
