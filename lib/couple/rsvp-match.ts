// Pure decision logic for public RSVPs (unit-tested without a database).

export type GuestNameRow = { id: string; full_name: string };

/**
 * The single guest whose name matches (trimmed, case-insensitive, exact), or
 * null when there is no match or more than one: an ambiguous name must never
 * update the wrong person, so it becomes a new guest instead.
 */
export function matchGuestByName<T extends GuestNameRow>(guests: readonly T[], fullName: string): T | null {
  const normalized = fullName.trim().toLowerCase();
  const matches = guests.filter((g) => g.full_name.trim().toLowerCase() === normalized);
  return matches.length === 1 ? matches[0] : null;
}

/** Words of a name, lowercased, for order-free comparison. */
function nameWords(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).sort().join(" ");
}

/**
 * A7: a guest's greeting is signed with first and last name (Session 4's
 * event_greetings has no guest link); it is theirs when the words match the
 * guest's name in either order.
 */
export function greetingMatchesGuest(fullName: string, firstName: string, lastName: string): boolean {
  return nameWords(fullName) === nameWords(`${firstName} ${lastName}`);
}
