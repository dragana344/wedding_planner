# Email (INFRA-006, INFRA-008, OBS-005)

Provider: **Resend**, on a verified sending subdomain, e.g. `mail.<domain>`. Two senders use it:

1. **Supabase Auth** (confirmation, password reset, email change) via Resend's SMTP.
2. **The app** via Resend's HTTP API (`lib/email.ts`):
   - contact-form notifications to the team (OBS-005);
   - guest invitations sent by the couple, each with the guest's personal link (A9, `lib/couple/invitation-sending.ts`);
   - the guests' reminder, by default 15 days before at 10:00 Skopje, sent by the hourly cron `/api/cron/reminders` (A10, `lib/couple/reminders.ts`);
   - a note to the couple when a guest changes an earlier answer (A11, `lib/couple/rsvp.ts`).

   Guest emails use Reply-To = the couple's contact email, and links point at `SITE_URL` (see SECRETS.md).

## One-time setup

1. Resend → Domains → Add `mail.<domain>`, region EU.
2. Add the DNS records Resend shows: SPF (TXT), DKIM (TXT/CNAME), and the MX/return-path record. Wait for *Verified*.
3. DMARC on the apex: TXT `_dmarc.<domain>` = `v=DMARC1; p=none; rua=mailto:dmarc@<domain>; fo=1`. After 2–4 weeks of clean reports move to `p=quarantine`.
4. Resend → API Keys → create **two** keys, both *Sending access* restricted to `mail.<domain>`:
   - `supabase-smtp` → Supabase → Authentication → Emails → SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = key, sender `no-reply@mail.<domain>`, sender name `КАДЕ СУМ?`.
   - `app` → Vercel env `RESEND_API_KEY` (Production, Sensitive).
5. Vercel env (Production): `EMAIL_FROM` = `КАДЕ СУМ? <no-reply@mail.<domain>>`, `CONTACT_NOTIFY_EMAIL` = the team inbox.
6. Supabase → Authentication → Rate Limits → emails per hour: 100.
7. Supabase → Authentication → Emails → Templates: for Confirm signup, Reset password and Change email address paste the HTML from `supabase/templates/` and the subject from `supabase/config.toml` (`[auth.email.template.*]`).

## Verify

- Trigger a password reset for a Gmail and an Outlook test account. Both land in the inbox; "Show original" shows `spf=pass`, `dkim=pass`, `dmarc=pass`.
- mail-tester.com score ≥ 9/10.
- Submit the marketing contact form; the team inbox receives "Нова порака од контакт формата: …" with Reply-To set to the sender.

## Behaviour when email is down

- Auth emails: Supabase returns an error to the form; the user can retry.
- Contact form: the message is stored first; a failed notification is logged (`contact_notification_failed`) and the visitor still sees success.
- Invitations: a failed email is counted as failed in the couple's result and the guest stays "not sent" (`invitation_email_failed`).
- Reminders: each guest is stamped when their email goes out, so a failed or interrupted run never emails anyone twice; guests whose email failed are logged (`reminder_email_failed`). With email not configured the cron does nothing and the reminder goes out once it is; the couple's guest page lists the guests to remind by WhatsApp/Viber meanwhile.
- Changed answers: the guest's answer is saved first; a failed note to the couple is logged (`rsvp_change_email_failed`).
