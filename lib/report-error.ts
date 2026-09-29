import * as Sentry from "@sentry/nextjs";

// Single place where the browser reports an unexpected UI error (the error
// boundaries in app/error.tsx and app/global-error.tsx). Sentry (OBS-001)
// scrubs personal data before sending; without a DSN this only logs.
export function reportClientError(error: Error & { digest?: string }): void {
  Sentry.captureException(error, { tags: { digest: error.digest } });
  console.error("Unhandled UI error", { message: error.message, digest: error.digest });
}
