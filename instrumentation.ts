import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-scrub";

// OBS-001: error reporting for route handlers, server components and the
// proxy (both run on the Node.js runtime in Next.js 16). No-op without a DSN.
export async function register() {
  if (sentryOptions.enabled) Sentry.init(sentryOptions);
}

export const onRequestError = Sentry.captureRequestError;
