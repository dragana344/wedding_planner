import type { ErrorEvent } from "@sentry/nextjs";
import { redact } from "@/lib/log";

// OBS-001: nothing personal leaves for Sentry. No request bodies, cookies,
// headers or query strings (invitation slugs are credentials), no user
// identity, and any extra/context field whose name suggests personal data is
// redacted with the same rules as the server logs.

const SLUG = /\/invite\/[^/?#\s]+/g;

function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/\?[^\s#]*/g, "").replace(SLUG, "/invite/:slug");
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = { method: event.request.method, url: scrubUrl(event.request.url) };
  }
  delete event.user;
  if (event.extra) event.extra = redact(event.extra) as ErrorEvent["extra"];
  if (event.contexts) event.contexts = redact(event.contexts) as ErrorEvent["contexts"];
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: typeof b.message === "string" ? scrubUrl(b.message) : b.message,
      data: b.data
        ? (redact({
            ...b.data,
            url: scrubUrl(b.data.url as string | undefined),
            from: scrubUrl(b.data.from as string | undefined),
            to: scrubUrl(b.data.to as string | undefined),
          }) as typeof b.data)
        : b.data,
    }));
  }
  return event;
}

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
};
