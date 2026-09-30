# Monitoring and alerting (OBS-003)

| Check | Tool | What | Interval | Alerts to | Status |
|---|---|---|---|---|---|
| App + database up | UptimeRobot or Better Stack (free tier) | `GET https://<domain>/api/health` must be 200 with `"ok":true` (keyword monitor) | 1–5 min | On-call (see [INCIDENTS.md](INCIDENTS.md)): email + mobile push | *to create* |
| Marketing page up | same | `GET https://<domain>/` must be 200 | 5 min | same | *to create* |
| Backup fresh | GitHub Actions `backup.yml` → `freshness` job | newest R2 archive < 36 h | daily | GitHub failed-workflow email to repo admins | in repo |
| Live release is on `main` | GitHub Actions `release-check.yml` | `/api/health` release is an ancestor of `main` | hourly | GitHub failed-workflow email | in repo |
| Application errors | Sentry (OBS-001) | new issue / regression / spike | real time | on-call email | *DSN pending* |
| Quotas and cost | provider usage alerts ([QUOTAS.md](QUOTAS.md)) | usage thresholds | provider-defined | owner email | *to set* |

`/api/health` answers 200 only when a real query against Supabase succeeds (3 s bound), so one monitor covers the app, its region and the database. It sends `Cache-Control: no-store`, needs no auth and returns no personal data.

## Setup (owner)

1. Create the two HTTP monitors above; set "down" to alert after 2 consecutive failures (≈2–5 min).
2. Add the on-call people as alert contacts (email + the provider's mobile app).
3. GitHub → your profile → Settings → Notifications → Actions: "Send notifications for failed workflows only" on, so backup and release-check failures reach you.
4. Test: temporarily point the health monitor at `/api/health?fail` on staging (or pause staging's Supabase) and confirm the alert arrives within 5 minutes. Record it below.

| Date | Test | Alert received after | By |
|---|---|---|---|
| — | | | |
