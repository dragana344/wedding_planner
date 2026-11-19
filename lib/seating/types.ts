// Shared seat-list shapes (server lib, API and client components).

import type { SeatFlag } from "./flags";

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
  /** The guest's answer (0181): a seated "declined" is flagged on the plan. */
  rsvpStatus?: string;
}

export interface RoomSeating {
  tables: SeatTable[];
  seats: Seat[];
  guests: SeatGuest[];
  /** 0181: seated guests who declined or hold more seats than their party (`seatFlags`). */
  flags?: SeatFlag[];
}

export interface SeatInput {
  seatNumber: number;
  guestId?: string | null;
  guestName?: string | null;
}

export function tableTitle(table: Pick<SeatTable, "label" | "number">): string {
  return table.label ?? `Маса ${table.number}`;
}

// Project A §5: client-safe view of a row in event_seating_proposals (no
// snapshot — the browser only needs to list/approve/reject, never render the
// raw layout snapshot directly).
export type ProposedBy = "venue" | "couple";
export type ProposalStatus = "pending" | "approved" | "rejected" | "superseded";

export interface SeatingProposalView {
  id: string;
  proposed_by: ProposedBy;
  status: ProposalStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
}
