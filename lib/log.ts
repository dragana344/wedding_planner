// Structured server logging (OBS-002): one JSON object per line, which
// Vercel's log viewer and drains parse as-is. Never log passwords, tokens,
// cookies or guests' personal data: fields whose names suggest them are
// redacted before anything is written.

type Level = "info" | "warn" | "error";

const SENSITIVE_KEY = /pass(word)?|token|secret|cookie|authorization|api[-_]?key|full_?name|guest_?name|phone|e-?mail|notes?$|message|content|address/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      // error_* fields are our own error descriptions (errorFields), not user data.
      SENSITIVE_KEY.test(k) && !k.startsWith("error_") ? "[redacted]" : redact(v, depth + 1),
    ]),
  );
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (process.env.LOG_SILENT === "1") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...(redact(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Describes an error for logs without dumping request data it may carry. */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return { error_name: err.name, error_message: err.message, ...(code ? { error_code: code } : {}) };
  }
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message?: unknown; code?: unknown };
    return { error_message: String(e.message), ...(e.code ? { error_code: e.code } : {}) };
  }
  return { error_message: String(err) };
}

/** Security-relevant events: logins, lockouts, credential changes, deletions. */
export function logSecurityEvent(event: string, fields: Record<string, unknown> = {}): void {
  log("info", event, { security_event: true, ...fields });
}

export const REQUEST_ID_HEADER = "x-request-id";
