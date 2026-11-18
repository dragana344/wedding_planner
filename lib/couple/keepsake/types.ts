// The couple's whole event as one plain object (group A task 7): what the
// wedding book and the spreadsheets are built from. No server imports, so
// the builders are unit-tested with hand-made data.
import type { GuestSide, RsvpStatus } from "@/lib/couple/guests";
import type { ProgramDish } from "@/lib/couple/invitation-program";
import type { BudgetSummary } from "@/lib/couple/budget";
import { getBudgetCategoryLabel } from "@/lib/couple/budget-categories";

export type KeepsakeGuest = {
  fullName: string;
  side: GuestSide | null;
  status: RsvpStatus;
  partySize: number;
  childrenCount: number;
  /** "Месо ×2, Вегетаријанско ×1"; empty when nothing was chosen. */
  menuText: string;
  allergies: string | null;
  comment: string | null;
};

export type KeepsakeTable = {
  room: string;
  title: string;
  capacity: number;
  /** Seat by seat, in seat order. */
  seats: { number: number; name: string }[];
};

export type KeepsakeData = {
  isWedding: boolean;
  coupleNames: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  venueName: string;
  roomNames: string[];
  invitation: {
    templateId: string;
    message: string | null;
    /** JPEG or PNG bytes (the PDF format supports only those); null otherwise. */
    photo: { data: Buffer; format: "jpg" | "png" } | null;
  } | null;
  agenda: { time: string | null; title: string; location: string | null; notes: string | null }[];
  locations: { label: string; address: string | null; mapUrl: string | null }[];
  guests: KeepsakeGuest[];
  /** The kitchen's totals: confirmed people per menu, with the dishes. */
  menus: { name: string; count: number; dishes: ProgramDish[] }[];
  attending: { people: number; children: number; parties: number };
  /** When the final numbers last went to the venue, if ever. */
  numbersSentAt: string | null;
  tables: KeepsakeTable[];
  greetings: { name: string; message: string; hasVideo: boolean; createdAt: string }[];
  budget: {
    venue: { estimated: number | null; paid: number | null };
    items: { category: string; name: string; estimated: number | null; paid: number; paidBy: string | null; paymentDate: string | null; notes: string | null }[];
    totalEstimated: number;
    totalPaid: number;
  };
  checklist: { title: string; dueDate: string | null; done: boolean; subtasks: { title: string; done: boolean }[] }[];
  notes: { title: string; content: string; updatedAt: string }[];
};

/** "Месо ×2, Вегетаријанско ×1" for one guest; one menu means the whole confirmed party eats it. */
export function guestMenuText(
  guest: { rsvp_status: RsvpStatus; party_size: number; menu_counts: Record<string, number> },
  menus: readonly { id: string; name: string }[],
): string {
  if (guest.rsvp_status !== "confirmed") return "";
  if (menus.length === 1) return `${menus[0].name} ×${guest.party_size}`;
  return menus
    .filter((m) => (guest.menu_counts[m.id] ?? 0) > 0)
    .map((m) => `${m.name} ×${guest.menu_counts[m.id]}`)
    .join(", ");
}

/** The couple's budget as the book and the spreadsheet show it (category labels, custom ones kept). */
export function toKeepsakeBudget(summary: BudgetSummary): KeepsakeData["budget"] {
  return {
    venue: { estimated: summary.venue.estimated_amount, paid: summary.venue.paid_amount },
    items: summary.items.map((i) => ({
      category: i.category === "other" && i.custom_label ? i.custom_label : getBudgetCategoryLabel(i.category),
      name: i.name,
      estimated: i.estimated_amount,
      paid: i.paid_amount,
      paidBy: i.paid_by,
      paymentDate: i.payment_date,
      notes: i.notes,
    })),
    totalEstimated: summary.totalEstimated,
    totalPaid: summary.totalPaid,
  };
}
