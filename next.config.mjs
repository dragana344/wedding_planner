import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants.js";
import { assertRequiredEnv } from "./lib/required-env.mjs";

const isDev = process.env.NODE_ENV !== "production";

// The Supabase project the browser talks to (REST, auth, storage images and
// realtime). Read at build time, same as the NEXT_PUBLIC_ vars themselves.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const supabaseWs = supabaseOrigin.replace(/^http/, "ws");

// Browser error reports go straight to Sentry's ingest host (OBS-001).
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryOrigin = sentryDsn ? new URL(sentryDsn).origin : "";

// Content-Security-Policy (SEC-001). script-src needs 'unsafe-inline' because
// Next.js emits inline bootstrap scripts and we don't run a nonce
// middleware; revisit after the Next.js upgrade (SEC-024). style-src needs it
// for the inline style={{}} attributes used across the panels. Dev adds
// 'unsafe-eval' for React Fast Refresh.
export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${sentryOrigin}`.replace(/\s+/g, " ").trim(),
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

export const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Enforced: e2e/csp-pages.spec.ts visits every venue, couple and public
  // page and fails on any violation (SEC-001).
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

// Private areas stay out of search engines (COMP-004); the marketing page at
// "/" stays indexable. robots.txt (app/robots.ts) says the same.
export const noindexPaths = ["/venue", "/venue/:path*", "/couple", "/couple/:path*", "/invite/:path*", "/api/:path*"];
const noindexHeader = { key: "X-Robots-Tag", value: "noindex, nofollow" };

/** @type {import('next').NextConfig} */
export const nextConfig = {
  poweredByHeader: false,
  // PERF-001: pages may use next/image for photos served from Supabase Storage.
  images: supabaseOrigin
    ? {
        remotePatterns: [
          {
            protocol: /** @type {"https" | "http"} */ (new URL(supabaseOrigin).protocol.replace(":", "")),
            hostname: new URL(supabaseOrigin).hostname,
            port: new URL(supabaseOrigin).port,
            pathname: "/storage/v1/object/public/**",
          },
        ],
      }
    : undefined,
  experimental: {
    // Next.js's client-side Router Cache keeps a snapshot of every visited
    // dynamic page for up to 30s by default, independent of each page's own
    // `export const dynamic = "force-dynamic"` (which only controls the
    // server-side render, not whether the client reuses an old copy). That
    // gap has already caused stale-data bugs on individual pages — the venue
    // dashboard, the room floor-plan editor, and the couple's invitation page
    // (which could show an empty form again right after generating a link,
    // just from navigating away and back). Setting dynamic staleTime to 0
    // closes this whole bug class app-wide instead of chasing it page by
    // page.
    staleTimes: {
      dynamic: 0,
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...noindexPaths.map((source) => ({ source, headers: [noindexHeader] })),
    ];
  },
};

// Fail the build, or the server boot, with the missing variable's name
// (REL-002) rather than at the first request that needs it.
const VALIDATED_PHASES = new Set([PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER, PHASE_DEVELOPMENT_SERVER]);

function config(phase) {
  if (VALIDATED_PHASES.has(phase)) assertRequiredEnv();
  return nextConfig;
}

// OBS-001: with a DSN, Sentry wraps the build to upload source maps (deleted
// from the output afterwards, so they are never served). Without one, the
// build is untouched.
const withSentryConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? (await import("@sentry/nextjs")).default.withSentryConfig
  : null;

export default withSentryConfig
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA },
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      silent: !process.env.CI,
    })
  : config;
