// Table fill on the seating plan (B5): free / partly taken / full, in the
// status colours of MASTER §5 (green / ochre / red), dark enough for the
// white table label on top.

export type Occupancy = "free" | "partial" | "full";

export function occupancyOf(capacity: number, taken: number): Occupancy {
  if (taken <= 0) return "free";
  return taken >= capacity ? "full" : "partial";
}

export const OCCUPANCY_COLORS: Record<Occupancy, string> = {
  free: "#3F8A5A",
  partial: "#B7862B",
  full: "#A8433A",
};

export const OCCUPANCY_LABELS: Record<Occupancy, string> = {
  free: "Слободна",
  partial: "Делумно пополнета",
  full: "Полна",
};
