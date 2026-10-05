// Turns whatever a venue-panel action threw into the text shown to staff.
//
// The panel writes to Supabase straight from the browser, so a refusal from a
// database trigger arrives as a PostgREST error object, not an `Error`. The
// triggers that enforce the venue's plan raise their message for the user, in
// Macedonian, with SQLSTATE P0001 ("Достигнат е лимитот од 1 простории.",
// "Оваа функција не е вклучена во вашиот пакет."): those must reach the
// screen, or the venue only ever sees "try again" and never learns it hit a
// limit. Anything else from the database stays behind the fallback.
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const { code, message } = err as { code?: unknown; message?: unknown };
    if (code === "P0001" && typeof message === "string" && /[А-Яа-яЀ-ӿ]/.test(message)) return message;
  }
  return fallback;
}
