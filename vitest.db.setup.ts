import dotenv from "dotenv";
import fs from "fs";

// Written by scripts/write-test-env.mjs from `supabase status` (see
// `npm run test:db`). Never .env.local: that file may point at Supabase Cloud.
const envFile = ".env.test.local";
if (!fs.existsSync(envFile)) {
  throw new Error(`${envFile} is missing. Run \`supabase start\`, then \`npm run test:db\` (it writes this file).`);
}
dotenv.config({ path: envFile, override: true, quiet: true });

// The DB tests create and delete rows with the service-role key, so they must
// never run against a hosted project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const dbUrl = process.env.SUPABASE_DB_URL ?? "";
if (
  !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(supabaseUrl) ||
  (dbUrl && !/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(dbUrl))
) {
  throw new Error(
    `Refusing to run tests against non-local Supabase (${supabaseUrl || "unset"}). ` +
      "Point NEXT_PUBLIC_SUPABASE_URL at a local instance (supabase start) to run the test suite.",
  );
}

// Route handlers log a JSON line per request; keep the DB suite's output readable.
process.env.LOG_SILENT = "1";
