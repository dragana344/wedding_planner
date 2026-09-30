# Authentication settings (SEC-012, AUTH-002)

Three kinds of users (see [HOSTING.md](HOSTING.md)): venue staff use Supabase Auth; couples use the app's own event credentials; guests use invitation links. This page is about Supabase Auth for venue staff. The platform admin (`admin.<domain>`) is a fourth, separate Supabase Auth identity — same Auth project, `app_metadata.role = "platform_admin"` instead of a `venue_staff` row, and TOTP is mandatory rather than opt-in. See [ADMIN.md](ADMIN.md) for that flow in full; the redirect URL it needs is in the table below.

## Production Supabase Auth settings

Set these in the production project (Supabase → Authentication). Local development mirrors them in `supabase/config.toml` except where noted.

| Setting | Where | Production value | Local (`config.toml`) |
|---|---|---|---|
| Site URL | URL Configuration | `https://<domain>` (canonical, INFRA-002) | `http://127.0.0.1:3000` |
| Redirect URLs | URL Configuration | `https://<domain>/reset-password`, `https://admin.<domain>/**` ([ADMIN.md](ADMIN.md)) | `http://127.0.0.1:3000/reset-password`, `http://admin.localhost:<port>/**` |
| Confirm email | Sign In / Providers → Email | **On** | Off (dev convenience; flows still work without a mail round-trip) |
| Secure email change | Sign In / Providers → Email | On | On |
| Secure password change | Sign In / Providers → Email | **On** | On |
| Minimum password length | Sign In / Providers → Email | **10** | 10 |
| Leaked password protection | Sign In / Providers → Email (Pro) | **On** | n/a |
| Custom SMTP | Emails → SMTP | Resend ([EMAIL.md](EMAIL.md)) | Mailpit (local) |
| Email templates | Emails → Templates | Paste `supabase/templates/*.html` + subjects from `config.toml` | Same files |
| Rate limits | Rate Limits | Emails sent/hour: 100 (after custom SMTP); sign-ups & sign-ins: defaults; token refresh: default | defaults |
| MFA | Multi-Factor | TOTP enabled (SEC-016, when built) | — |

The app enforces the same password minimum in the forms (`minLength={10}` on signup and reset) and for couple passwords in the database (migration 0034).

## What changes for users when "Confirm email" is on

`/signup` creates the account, then shows "Please check your email to confirm your account before signing in." (`components/auth/SignupForm.tsx` already handles the no-session case). The venue is provisioned on first sign-in after confirming.

## Password reset flow (AUTH-002)

1. `/login` → "Заборавена лозинка" calls `resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`.
2. The email (template `recovery.html`) links to Supabase's verify endpoint, which redirects to the Site URL / redirect URL with a recovery token.
3. `components/RecoveryRedirect.tsx` catches the `PASSWORD_RECOVERY` event wherever the link lands and forwards to `/reset-password`.
4. `/reset-password` sets the new password (min 10), then signs out every other session of that user (`signOut({ scope: "others" })`, SEC-017) and continues to `/venue`.
5. Recovery links are single-use and expire (Supabase default 1 hour; OTP expiry under Email settings).

**Checklist to run on staging and production after every auth/SMTP change:**

- [ ] Forgot password → email arrives in Gmail and Outlook inbox (not spam), in Macedonian, from the product domain.
- [ ] Link opens `/reset-password`; new password works; old one doesn't.
- [ ] Opening the same link again fails.
- [ ] A second browser that was signed in is signed out after the change.
- [ ] New signup with confirmation on: no access to `/venue` before clicking the email link.

Record the date and result here:

| Date | Environment | Result | By |
|---|---|---|---|
| — | staging | | |
| — | production | | |

## Two-factor authentication for venue staff (SEC-016)

Opt-in TOTP (authenticator app: Google Authenticator, Microsoft Authenticator, 1Password, ...) through Supabase Auth MFA. Making it mandatory for every staff account is a separate, open decision.

**Production setting:** Supabase dashboard → Authentication → Multi-Factor → **TOTP (App Authenticator): enabled** (enroll and verify). Locally this is `[auth.mfa.totp] enroll_enabled = true, verify_enabled = true` in `supabase/config.toml` (needs `supabase stop && supabase start` to take effect).

**How it works**

- **Enrol:** `/venue/settings` → "Двофакторска автентикација" → "Вклучи": the panel shows a QR code and the secret for manual entry; the staff member confirms with a 6-digit code (challenge + verify). The session becomes `aal2`.
- **Login:** `/login` checks the password, then, when `getAuthenticatorAssuranceLevel()` reports `nextLevel = aal2` with `currentLevel = aal1`, asks for the code before continuing to `/venue`.
- **Disable:** the settings panel asks for a current code (a fresh `aal2`), then removes the factor.
- **Enforcement, in the database:** `is_venue_staff_for` and the `venue_staff` policy (migration 0044) treat a user with a verified factor as staff only in an `aal2` session. An `aal1` session therefore sees no venue data at all: the panel layout finds no staff row and sends the user to `/login`, which detects the unfinished session and asks for the code. The privacy API routes resolve staff the same way, so they refuse too. There is deliberately no check in `proxy.ts`: it would cost an Auth round trip on every request of every user without MFA.

**Lost device / recovery:** there are no backup codes. The staff member contacts the venue owner / our support, who first **verifies their identity** out of band (e.g. a call to the number on file, not just a reply from the email address). Then, in the Supabase dashboard → Authentication → Users → the user → **MFA factors**, delete the TOTP factor (or `auth.admin.mfa.deleteFactor({ userId, id })` with the service role). The user signs in with the password alone and can enrol a new device from settings. Record who did it and why in the support log.

**Checklist (staging, then production):**

- [ ] Enrol from settings, sign out, sign in: the code is required; a wrong code is refused.
- [ ] With the factor enrolled, stop at the code step and open `/venue` in the same browser → back at `/login`, on the code step.
- [ ] `curl` a venue API (`/api/venue/privacy/export`) with the aal1 session cookie → 401.
- [ ] Disable from settings with a current code; the next login asks only for the password.
