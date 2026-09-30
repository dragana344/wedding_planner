# SEC-013 - Bot protection on public forms

**Category:** security · **Priority:** P2 · **Effort:** M · **Depends on:** SEC-002

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Adds a visible (or invisible) challenge widget to three public forms.

## Context

Add an invisible/low-friction challenge (Cloudflare Turnstile or hCaptcha, also usable as Supabase Auth captcha) to contact, signup and RSVP if rate limiting alone proves insufficient after launch.

## Coachfio reference

Coachfio's signed-out forms are the most abused surface and get the strictest limits.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/routes/support.py (fail-closed limits on email-sending forms)`

Commits: `6697bad`

## Steps

Target files:

- `components/marketing/ContactForm.tsx`
- `components/auth/SignupForm.tsx`
- `components/invite/RsvpForm.tsx`
- `matching API routes`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Automated submissions without a valid token are rejected server-side.

## Verification

- Submit via curl without a token -> 400/403.

## Out of scope

- Changing form fields or layout beyond the widget.
