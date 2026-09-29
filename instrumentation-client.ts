import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-scrub";

// OBS-001: browser error reporting. No-op without NEXT_PUBLIC_SENTRY_DSN.
if (sentryOptions.enabled) Sentry.init(sentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
