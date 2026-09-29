# Cookies and browser storage (COMP-002)

| Name | Set by | Purpose | Lifetime | Flags | Category |
|---|---|---|---|---|---|
| `couple_session` | `app/api/couple/login/route.ts` | Keeps a couple signed in to their event (random token; only its SHA-256 is stored server-side) | 30 days, sliding (renewed at most daily) | HttpOnly, Secure, SameSite=Lax, Path=/ | Strictly necessary |
| `sb-<project-ref>-auth-token` (may be split into `.0`, `.1`) | `@supabase/ssr` (browser client, `proxy.ts`) | Venue staff session (access + refresh token) | Session refresh token lifetime (Supabase default: until sign-out / inactivity policy) | Secure, SameSite=Lax, Path=/; not HttpOnly (the browser client must read it) | Strictly necessary |
| `sb-<project-ref>-auth-token-code-verifier` | `@supabase/ssr` | PKCE verifier during password reset / email links | Minutes | as above | Strictly necessary |
| `maintenance_bypass` | `proxy.ts` (`maintenanceResponse`, REL-007) | Lets the team open the site while `MAINTENANCE_MODE=1`; only set for someone who opens a URL with the bypass token | 12 hours | HttpOnly, Secure, SameSite=Lax, Path=/ | Strictly necessary (team only) |

**Local/session storage:** none. The app stores nothing in `localStorage`, `sessionStorage` or IndexedDB (checked 29 Sep 2026: no references in `app/`, `components/`, `lib/`).

**Third-party cookies:** none. No analytics, ads, embeds or social widgets. Fonts are self-hosted by Next.js. Sentry (OBS-001), if enabled, sets no cookies.

## Decision

Only strictly necessary cookies are used, so **no consent banner is required** (ePrivacy Art. 5(3) exemption; the privacy policy, COMP-001, lists them). **Adding analytics or any non-essential cookie/storage later requires consent first** (OBS-007) and an update of this file.

Check this table against browser devtools (Application → Cookies) on `/`, `/venue`, `/couple` and `/invite/<slug>` after any auth change.
