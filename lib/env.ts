// Typed access to the public Supabase settings. Validated at build/boot by
// lib/required-env.mjs (via next.config.mjs); the throws here are the last
// line of defence for code paths that run outside Next (scripts, tests).
// NEXT_PUBLIC_ values must be read with literal `process.env.NAME` so Next.js
// can inline them into the browser bundle.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}. See docs/production/SECRETS.md.`);
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
