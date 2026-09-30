# Decisions log (production readiness, Sep 2026)

Decisions taken while working through `production-tasks/`, so nobody has to rediscover why. "Owner" items are open and need an answer from the product owner.

## Taken

| Area | Decision | Why | Task |
|---|---|---|---|
| Runtime | Node 22, pinned (`.nvmrc`, `engines`, `engine-strict`) | supabase-js needs native WebSocket (Node ≥ 22); Vercel supports it | INFRA-004 |
| Framework | Next.js 16.3 + React 19; `middleware.ts` → `proxy.ts` (Node runtime) | Only 16.x fixes the critical/high advisories | SEC-024 |
| Lint | ESLint 9 flat config; `react-hooks/set-state-in-effect` off | 14 existing effects would need behaviour-changing rewrites; separate change | SEC-024 |
| Rate limiting store | Postgres table + atomic function, not Upstash | No extra processor, EU data stays in one place, same-region latency | SEC-002 |
| Rate limits | login 10/min/IP, signup 5/h/IP, contact 5/h/IP (fail closed); RSVP 20/h/IP/slug, photo 20/h/event (fail open) | Spec budgets; credential/email/account routes must not run unlimited | SEC-002 |
| CSP | Enforced. `script-src 'unsafe-inline'` (Next inline bootstrap, no nonce proxy), `style-src 'unsafe-inline'` (inline style attributes) | Zero violations on every page (e2e/csp-pages.spec.ts); a nonce would force dynamic rendering everywhere | SEC-001 |
| Privileges | Explicit grants; new tables/functions closed to API roles by default | Supabase Cloud and local CLI start from different defaults; drift check needs them equal | SEC-023, SEC-006 |
| SEC-019 | Explicit `WITH CHECK` added, but the issue was not exploitable | Postgres reuses `USING` as `WITH CHECK` for UPDATE policies without one; kept explicit + regression test | SEC-019 |
| Couple sessions | SHA-256 at rest; no fallback lookup by raw token | A fallback would let a leaked hash be replayed; cost: sessions created in the minutes between migration 0032 and the app deploy must log in again | SEC-008 |
| Couple passwords | Minimum 10 characters in the database; generator makes 12 | Hand-typed passwords like `1234` were accepted | SEC-027 |
| Password regenerate | Ends all couple sessions of that event | The reset exists for leaked credentials | SEC-009 |
| Floor-plan lock | New venues start with no code (set in Settings); existing ones keep theirs | No shared `0000`; least UI change. **The seed/demo venue "Kade Sum" created on 28 Sep still has `0000` — set a code in Settings.** | SEC-010 |
| Double booking | Exclusion constraint on real time ranges (overnight-aware, 3 h default); cancelled/completed don't hold a table | Subset of the app's stricter check, so it never refuses what the UI allows | DATA-012 |
| Public RSVP overwrite | Guests may still change their own answer via the link; every change is recorded (audit) and the couple sees "Одговор преку поканата: <time> (претходно: …)" | Guests genuinely change their minds; blocking would push them to message the couple; visibility closes the silent-sabotage hole | SEC-021 |
| Login enumeration | One message for wrong password, unknown user and locked account | Lockout message confirmed usernames | SEC-022 |
| Placeholder pages | Stay visible and marked "Наскоро"; Support became a real contact page | Matches the approved design; no dead ends | ARCH-003 |
| Invitation photos | Browser → Storage via signed upload; bucket allow-list JPEG/PNG/WebP/GIF/AVIF, 50 MB; magic-byte check before attaching; SVG refused | Vercel's 4.5 MB body limit; public bucket | SEC-005, SEC-028 |
| File cleanup | DB triggers queue deleted/replaced photos; hourly Vercel cron drains; unconfirmed uploads swept after 24 h | Deletes happen from the browser and by cascade; SQL can't delete Storage objects | DATA-011 |
| Multi-step writes | Six operations moved into transactional Postgres functions | Partial writes on failure | REL-005 |
| Errors to users | Only messages our code throws on purpose; everything else → the route's fallback, original logged with request id | Postgres/PostgREST text leaked schema details | SEC-003 |
| Logging | JSON lines, one per API request, request ids from the proxy; PII keys redacted | Queryable logs without personal data | OBS-002 |
| Error tracking | Sentry, off until `NEXT_PUBLIC_SENTRY_DSN` is set; scrubbed events; no tunnel (Turbopack) — CSP allows the ingest host when enabled | | OBS-001 |
| Account deletion | Full deletion (venue, its data, staff users, files) | Default until the owner decides otherwise (see open items) | DATA-005 |
| Event erasure | Keeps the event row (date, type, status, finance) but no personal data | Calendar/reports stay intact | DATA-005 |
| Bot protection | Not now; revisit if rate limits prove insufficient after launch | Spec makes it conditional; avoids a third-party widget and CSP change | SEC-013 |
| Product analytics | Not now | Needs consent design and a tool choice; no need before launch | OBS-007 |
| Maintenance mode | Env flag + team bypass cookie | Rarely needed; expand/contract avoids downtime | REL-007 |
| Guest album storage | Private bucket `event-media`, service role only; guests upload through signed URLs from `/api/e/<token>`, couples read through signed links (1 h) | Guests have no account; the album token is the credential; a private bucket keeps photos out of public URLs | Session 4 (C1, C3) |
| Album photo processing | Browser re-encodes every photo to JPEG ≤ 2560 px before upload; the server sniffs bytes, checks the real size (≤ 15 MB) and the quota at confirm | Smaller uploads on mobile data; re-encoding also strips EXIF GPS | Session 4 (C1) |
| HEIC | No server conversion: iPhone Safari converts on upload; a browser that can't decode the file tells the guest to use JPEG or a screenshot | No image pipeline on Vercel yet | Session 4 (C1) |
| Video greetings | ≤ 30 s (checked in the browser) and ≤ 100 MB (checked on the server); MP4, MOV or WebM by magic bytes; **no transcoding** — 720p compression later | A transcoding pipeline is a separate service; the size cap bounds storage | Session 4 (C7) |
| Album quota | 5 GB per event until the package's `storage_gb` entitlement exists; checked when an upload starts and again with the real size at confirm | Declared sizes can lie; the second check is authoritative | Session 4 (C5, C6) |
| Unconfirmed uploads | Photos wait in their own private bucket `event-media-uploads` capped at 15 MB (0081); video greeting starts are limited to 5/h per guest and 100/h per album; both swept after 24 h | A signed upload URL can't bound its size and an abuser never confirms, so the bucket limit and start budgets bound what a leaked album link can store | Session 4 review |
| Album download | ZIP parts of ≤ 200 MB / 150 files | The stream lasts as long as the client downloads; ~160 s at 10 Mbit/s stays inside the 300 s function limit | Session 4 review |
| Album retention | Mechanism built, **off** until `MEDIA_RETENTION_DAYS` is set (owner decision, see RETENTION.md) | Deleting guests' photos is irreversible; the period must match the privacy notice | Session 4 (C6) |
| Logo watermark on photos (C8) | Later | Needs server-side image processing | Session 4 |
| "Send to photo studio" (C9) | Later | Partner integration, not in scope | Session 4 |

## Open — owner decisions

1. **Plans**: approve Supabase Pro and Vercel Pro (HOSTING.md).
2. **Retention periods** (RETENTION.md): guest data 12 months after the event? contact messages 24 months? Then schedule the purge (exact SQL in RETENTION.md). The privacy policy must state the same numbers.
3. **Account deletion**: keep anything (e.g. anonymised finance history)? Currently everything is deleted.
4. **Staging**: create the staging Supabase project (ENVIRONMENTS.md) so previews and local dev stop sharing production.
5. **MFA**: opt-in now; make it mandatory for staff later?
6. **Legal**: fill company details in the privacy policy/terms/DPA placeholders; consider a human lawyer's check (LEGAL-REVIEW.md).
7. **Domain, Resend, Sentry, R2, uptime monitor**: accounts to create (SETUP.md).
8. **On-call**: names and contacts in INCIDENTS.md.
9. **RSVP form language**: the public RSVP form and some auth messages are still in English (found by the E2E run). Translate to Macedonian?
10. **Accessibility fixes** (A11Y.md): unlabeled inputs, muted-colour contrast, `<html lang="en">` → `mk` — approve the markup/colour changes.
