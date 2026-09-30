# Incident response (OBS-006)

## On call

| Role | Person | Contact | Backup |
|---|---|---|---|
| Primary on-call | *name* | *phone, email* | *name* |
| Owner / decisions, venue communication | *name* | *phone, email* | |

Alerts reach the primary through the uptime monitor (email + push), Sentry, and GitHub failed-workflow emails ([MONITORING.md](MONITORING.md)). Target: acknowledge within 15 minutes during 08:00–24:00, next morning otherwise. Weddings happen on weekends and evenings; on a Friday–Sunday the primary keeps the phone on.

## First five minutes (any incident)

1. Acknowledge the alert; note the time.
2. Check `https://<domain>/api/health`, Vercel → Deployments (was there a deploy?), Supabase status page and project → Logs, Sentry.
3. If a deploy in the last hour is the likely cause: **roll it back** ([DEPLOY.md](DEPLOY.md), Instant Rollback) before debugging.
4. Open an incident note (template below) and keep timestamps.

## Scenarios

### 1. Site down / errors everywhere
- Health 5xx and Vercel shows a recent deploy → Instant Rollback → verify health.
- Health 503 (database) → see scenario 2.
- Vercel incident (vercel-status.com) → wait; post a status note to venues if > 15 min.

### 2. Supabase down or slow
- Check status.supabase.com and project → Reports (CPU, connections).
- Connection exhaustion → Supabase → Database → restart the pooler / check for a runaway query (Reports → Query performance); kill it.
- Regional outage → nothing to fail over to; communicate. Couples/venues will see errors; data is safe.

### 3. Emails not arriving (signup, password reset, contact form)
- Supabase → Auth logs for SMTP errors; Resend → Logs for bounces/blocks; Resend status page.
- Rate limit hit → raise it (Auth → Rate Limits) or wait.
- Domain problem (SPF/DKIM) → check Resend → Domains is still *Verified*; fix DNS.
- Workaround for a stuck venue: an owner can set a temporary password via Supabase → Authentication → Users → *Send password recovery* after the fix.

### 4. Data deleted or corrupted by mistake
- **Stop further damage first**: if a bug causes it, roll back the deploy.
- Find the scope (which venue/event, since when) from logs (request ids) and Supabase logs.
- Small scope: restore the affected rows by hand from the newest Supabase backup restored into the isolated drill project ([BACKUPS.md](BACKUPS.md)) — never restore production data anywhere else.
- Large scope: full restore / PITR, after agreeing with the owner (everything after the restore point is lost).

### 5. Leaked key or credential
- Service-role / secret key: Supabase → API Keys → **delete it now** (instant), create a new one, update Vercel, redeploy ([SECRETS.md](SECRETS.md)). Review Supabase logs for use.
- Resend / Sentry / R2 / Vercel / GitHub tokens: revoke in the provider, create new, update the secret store.
- A venue staff account compromised: Supabase → Users → the user → sign out all sessions; reset password; check their venue's recent changes.
- A couple's password leaked: the venue regenerates it (ends all couple sessions for that event, SEC-009).
- Personal data exposed → the owner decides on notifying the venue(s) (as controllers) and, where required, the data protection authority within 72 hours.

## Communicating with venues

- Short, factual, in Macedonian: what is affected, since when, what they can do meanwhile, when the next update comes.
- If an event is today, call the venue directly.
- After resolution: one message with what happened and what changed.

## Post-incident note (template)

```
Incident: <title>                 Date: <yyyy-mm-dd>     Severity: <low/medium/high>
Detected: <time, how>            Resolved: <time>       Duration: <min>
Impact: <who, what they could not do, data affected?>
Timeline: <timestamps of key steps>
Root cause: <one paragraph>
What went well / what didn't:
Follow-ups: <task, owner, due date>
```

## Tabletop log

| Date | Scenario walked | Gaps found | By |
|---|---|---|---|
| — | | | |
