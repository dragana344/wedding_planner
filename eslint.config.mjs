// ESLint 9 flat config (Next.js 16 removed `next lint`).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // New in eslint-plugin-react-hooks 6 (React Compiler guidance). The 14
      // existing hits sync state from props/timers inside effects; rewriting
      // them changes component behaviour, so it is a separate, tested change,
      // not part of the Next.js upgrade (SEC-024).
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "supabase/**"]),
]);
