# Limits that can stop the product (OBS-004)

Fill in "Current" from each dashboard at launch and review monthly. Alert thresholds are set in each provider where it supports usage alerts; otherwise the monthly review is the check.

| Provider | Limit | Plan ceiling | Current | Alert at | Where to see / set alert | If hit |
|---|---|---|---|---|---|---|
| Supabase (Pro) | Database size | 8 GB included (then billed) | | 70 % | Org → Usage; spend cap off → billing alerts | Upgrade compute/disk; clean old data (DATA-007) |
| Supabase | Storage size | 100 GB included | | 70 % | Org → Usage | Orphan sweep (DATA-011); image limits (SEC-028) |
| Supabase | Egress | 250 GB included | | 70 % | Org → Usage | Cache headers / image optimisation (PERF-001) |
| Supabase | Monthly active users | 100 000 | | 70 % | Org → Usage | — |
| Supabase | Direct DB connections | per compute size (e.g. 60 on Micro) | | 80 % | Reports → Database | Use the pooler; raise compute |
| Supabase | Auth emails / hour | as set in Auth → Rate limits (100) | | on errors | Auth logs | Raise limit; check Resend quota |
| Supabase | Max upload size | 50 MB default (Pro: configurable) | | — | Storage settings | SEC-005 |
| Vercel (Pro) | Function invocations / Active CPU | Pro included usage | | 75 % | Team → Usage → Spend Management | Spend limit + notification |
| Vercel | Fast data transfer (bandwidth) | Pro included | | 75 % | Team → Usage | CDN caching |
| Vercel | Cron jobs | Pro: hourly allowed | — | — | Project → Cron | Storage cleanup runs hourly |
| Vercel | Function body size | 4.5 MB per request | — | — | fixed | Uploads over this must go direct to Storage (SEC-005) |
| Resend | Emails / day and / month | Free: 100/day, 3 000/month | | 80 % | Resend → Usage | Upgrade plan |
| Sentry | Errors / month | plan quota | | 80 % | Sentry → Stats; spike protection on | Raise quota / sample |
| Upstash | — | not used (rate limits live in Postgres) | — | — | — | — |
| Cloudflare R2 | Storage | 10 GB free, then per GB | | 80 % | R2 → Overview | Lifecycle rule (35 days) |
| Domain | Registration expiry | yearly | | 30 days before | Registrar auto-renew on | Renew |
| TLS | Certificate | auto-renewed by Vercel | — | — | Vercel → Domains | — |
