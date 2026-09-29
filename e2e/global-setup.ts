import { Client } from "pg";

// Every E2E request comes from the same IP, and the app's own rate limits
// (SEC-002, counted in public.rate_limits) would refuse a second or third run
// within the hour: venue signup allows 5 per hour per IP and the suite signs up
// several venues. Reset the counters the suite spends, on the LOCAL database
// only (playwright.config.ts already refused anything else).
const BUCKETS = ["venue-signup", "couple-login", "rsvp"];

export default async function globalSetup() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.warn("SUPABASE_DB_URL is not set; app rate-limit counters were not reset.");
    return;
  }
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("delete from public.rate_limits where split_part(key, ':', 1) = any($1::text[])", [BUCKETS]);
  } finally {
    await client.end();
  }
}
