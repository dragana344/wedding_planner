import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import fs from "fs";

// TEST-005: end-to-end smoke tests for the critical flows, against a
// production build (`next build && next start`, so CSP and other headers match
// prod) talking to the LOCAL Supabase started with `supabase start`.
//
// Supabase config comes from .env.test.local (written by
// scripts/write-test-env.mjs from `supabase status`), never .env.local: that
// file may point at Supabase Cloud. The values are passed to the web server as
// real environment variables, which take precedence over any .env file Next
// loads on its own.
const envFile = ".env.test.local";
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true, quiet: true });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dbUrl = process.env.SUPABASE_DB_URL ?? "";

// The suite signs up users and writes rows with the service-role key: it must
// never run against a hosted project (same rule as vitest.db.setup.ts).
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(supabaseUrl) ||
  (dbUrl && !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(dbUrl))
) {
  throw new Error(
    `Refusing to run E2E tests against non-local Supabase (${supabaseUrl || "unset"}). ` +
      "Run `npx supabase start`, then `node scripts/write-test-env.mjs` to write .env.test.local.",
  );
}
if (!anonKey || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.test.local).");
}

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : 2,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // CI also writes playwright-report/ (uploaded when the job fails).
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "mk-MK",
    timezoneId: "Europe/Skopje",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      NEXT_TELEMETRY_DISABLED: "1",
      LOG_SILENT: "1",
    },
  },
});
