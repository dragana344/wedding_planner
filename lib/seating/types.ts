// Shared seat-list shapes (server lib, API and client components).

export interface SeatTable {
  elementId: string;
  label: string | null;
  number: number;
  capacity: number;
}

export interface Seat {
  elementId: string;
  seatNumber: number;
  guestId: string | null;
  guestName: string | null;
  displayName: string;
}

export interface SeatGuest {
  id: string;
  fullName: string;
  partySize: number;
  seatsTaken: number;
  side: "bride" | "groom" | null;
}

export interface RoomSeating {
  tables: SeatTable[];
  seats: Seat[];
  guests: SeatGuest[];
}

export interface SeatInput {
  seatNumber: number;
  guestId?: string | null;
  guestName?: string | null;
}

export function tableTitle(table: Pick<SeatTable, "label" | "number">): string {
  return table.label ?? `Маса ${table.number}`;
}
