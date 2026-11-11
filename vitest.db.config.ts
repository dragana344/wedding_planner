import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { unitTestFiles } from "./vitest.config";

// Tests that need a running local Supabase (`supabase start`). Run with
// `npm run test:db`, which first writes .env.test.local from `supabase status`.
export default defineConfig({
  plugins: [react()],
  test: {
    // node, not jsdom: under jsdom every supabase-js client shares one
    // localStorage, so a test that signs a staff user in silently swaps the
    // service-role `admin` client onto that user's session.
    environment: "node",
    // vitest.db.setup.ts must run first: it loads the local instance's URL and
    // keys before vitest.setup.ts fills in placeholders for anything unset.
    setupFiles: ["./vitest.db.setup.ts", "./vitest.setup.ts"],
    globals: true,
    include: ["tests/supabase/**/*.test.ts", "tests/lib/**/*.test.ts"],
    exclude: unitTestFiles,
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**", "proxy.ts"],
      reporter: ["text-summary", "html"],
      // Pure/content modules are covered by the unit suite, not this one.
      exclude: [
        "lib/legal/**",
        "lib/image-type.ts",
        "lib/date.ts",
        "lib/list-bound.ts",
        "lib/sentry-scrub.ts",
        "lib/auth-messages.ts",
        "lib/money.ts",
        "lib/skopje-time.ts",
        "lib/admin/audit-filters.ts",
        "lib/seating/occupancy.ts",
        "lib/venue/open-spot.ts",
        "lib/venue/user-error.ts",
        "lib/venue/event-display.ts",
        "lib/venue/reports.ts",
        "lib/seating/csv.ts",
        "lib/request-origin.ts",
        // "use client" fetch-wrapper: runs only in the browser, exercised by
        // the E2E suite, not reachable from a Node-based DB test.
        "lib/couple/seating-client-actions.ts",
        "lib/couple/client-utils.ts",
        "lib/venue/changes-client.ts",
        "lib/venue/custom-menu-client.ts",
        "lib/venue/events-client.ts",
        "lib/venue/menu-numbers-client.ts",
        "lib/venue/menu-usage-client.ts",
        "lib/venue/photo-upload-client.ts",
        "lib/venue/seating-client.ts",
        "lib/venue/settings-client.ts",
        "lib/venue/showcase-client.ts",
        // Pure, covered by tests/lib/pure/** (unit suite) or unit-only per
        // vitest.config.ts's unitTestFiles — same gap as the entries above,
        // just never added when those files were written.
        "lib/couple/checklist-vendor-link.ts",
        "lib/couple/event-hero.ts",
        "lib/couple/guest-print.ts",
        "lib/seating/proposal-diff.ts",
        "lib/venue/calendar-colors.ts",
        "lib/venue/calendar-grid.ts",
        "lib/venue/calendar-lanes.ts",
        "lib/venue/event-wizard.ts",
        "lib/venue/occupancy.ts",
        "lib/venue/transliterate.ts",
      ],
      reportsDirectory: "coverage/db",
      // TEST-006: floors at the measured baseline, re-measured at launch
      // (30 Sep 2026, DECISIONS.md "Coverage floors"). Only ever raise them.
      thresholds: { statements: 74, branches: 60, functions: 77, lines: 82 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
