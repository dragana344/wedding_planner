/**
 * Typed confirmations for destructive privacy actions (DATA-006): the text
 * must equal the expected name after trimming, case included. Shared by the
 * panel (button gating) and the API routes (the real check).
 */
export function confirmationMatches(typed: string, expected: string): boolean {
  return typed.trim().length > 0 && typed.trim() === expected.trim();
}
