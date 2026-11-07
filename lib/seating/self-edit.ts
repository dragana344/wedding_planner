// Project A §4: the couple's self-editing toggle, two levels, owner wins.
// The venue-wide switch being false always wins over a true per-event
// override; a per-event null follows the venue-wide switch.
export function effectiveSeatingSelfEditEnabled(venueWideEnabled: boolean, eventOverride: boolean | null): boolean {
  if (!venueWideEnabled) return false;
  return eventOverride ?? true;
}

export const SEATING_SELF_EDIT_DISABLED_NOTICE = "За промени, контактирајте го локалот.";
