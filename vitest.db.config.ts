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
      exclude: ["lib/legal/**", "lib/image-type.ts", "lib/date.ts", "lib/list-bound.ts", "lib/sentry-scrub.ts"],
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
