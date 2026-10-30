import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Tests that need no network and no database. `npm run test:unit` (and CI's
// default job) runs exactly these; everything that talks to Supabase lives in
// vitest.db.config.ts.
export const unitTestFiles = [
  "tests/smoke.test.ts",
  "tests/components/**/*.test.{ts,tsx}",
  "tests/lib/supabase/client.test.ts",
  "tests/lib/venue/occupancy.test.ts",
  "tests/lib/venue/transliterate.test.ts",
  "tests/lib/venue/event-wizard.test.ts",
  "tests/lib/api/**/*.test.ts",
  "tests/security/**/*.test.ts",
  "tests/lib/security/**/*.test.ts",
  "tests/lib/date.test.ts",
  "tests/lib/pure/**/*.test.ts",
  "tests/lib/admin/**/*.test.ts",
];

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: unitTestFiles,
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**", "proxy.ts"],
      reporter: ["text-summary", "html"],
      reportsDirectory: "coverage/unit",
      // TEST-006: floors at the measured baseline, re-measured whenever a
      // merge adds routes/libs tested mainly in the DB suite or E2E (same
      // reasoning as the 30 Sep 2026 reset, DECISIONS.md "Coverage floors")
      // — most recently for the venue-manager-login merge (19 Oct 2026).
      // Only ever raise them.
      thresholds: { statements: 29, branches: 24, functions: 29, lines: 31 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
