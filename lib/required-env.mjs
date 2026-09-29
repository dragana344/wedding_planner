// Required configuration, checked when Next.js builds or boots (REL-002) so a
// missing variable fails loudly with its name instead of surfacing later as a
// 500 from a `process.env.X!` assertion. Plain .mjs so next.config.mjs can
// import it. Values: docs/production/SECRETS.md.

export const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/** @param {Record<string, string | undefined>} env */
export function assertRequiredEnv(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set them in .env.local (local) or the Vercel project settings (Preview/Production). See docs/production/SECRETS.md.",
    );
  }

  let url;
  try {
    url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${env.NEXT_PUBLIC_SUPABASE_URL}".`);
  }

  // A deployed build must talk to a hosted project over TLS, never a laptop.
  if (env.VERCEL_ENV && (url.protocol !== "https:" || /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL must be an https Supabase project URL on Vercel (${env.VERCEL_ENV}), got "${url.origin}".`);
  }

  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are identical; the public key must be the anon/publishable key.");
  }
}
